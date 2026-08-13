import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildLists } from '../src/engine.mjs';
import { validateBatch } from '../src/data-model.mjs';
import { createProvider } from '../src/provider.mjs';
import { appendScan } from '../src/storage.mjs';
import { loadOfficialQuotes } from '../src/live-provider.mjs';
import { createFileCache, writeQuoteCache } from '../src/cache-provider.mjs';
import { classifyMarket } from '../src/market-regime.mjs';
import { filterUniverse } from '../src/universe.mjs';
import { loadOfficialMarket } from '../src/market-provider.mjs';
import { appendMarketSnapshot, historyInputs, readMarketHistory } from '../src/market-history.mjs';
import { snapshotRecommendations } from '../src/outcome.mjs';
import { applyTechnicalBatch } from '../src/technical-enrich.mjs';
import { loadOfficialFactorsDetailed } from '../src/factor-loader.mjs';
import { enrichBatch } from '../src/enrich.mjs';
import { coverageReport, missingFundamentalFields, partitionByCoverage } from '../src/data-coverage.mjs';
import { groupInsufficientReasons, hydrateOfficialHistories, PRODUCTION_SMOKE_SYMBOLS } from '../src/history-pipeline.mjs';
import { acquireScanLock, releaseScanLock } from '../src/scan-lock.mjs';
import { releaseGate } from '../src/release-gate.mjs';

const asOf = process.env.MARKET_DATE ?? new Date().toISOString().slice(0, 10);
const dataDir = process.env.DATA_DIR ?? 'data';
const pathFor = name => join(dataDir, name);
const lockPath = pathFor('scan.lock');
await mkdir(dataDir, { recursive:true });
if (!await acquireScanLock(lockPath)) throw new Error('Another scan is already running');

try {
  const batchId = `scan-${Date.now()}-${process.pid}`;
  const quoteCachePath = pathFor('quotes-cache.json');
  const provider = createProvider({ liveLoader:loadOfficialQuotes, cachedLoader:createFileCache(quoteCachePath) });
  const loaded = await provider.load(asOf);
  if (loaded.status === 'live') await writeQuoteCache(quoteCachePath, loaded.stocks, asOf);
  const validation = validateBatch(loaded.stocks, asOf);

  let factorMap = {}, factorSources = {};
  if (loaded.stocks.length) {
    const factorResult = await loadOfficialFactorsDetailed();
    factorMap = factorResult.factors;
    factorSources = factorResult.sources;
  }
  const stocksWithFactors = enrichBatch(loaded.stocks, factorMap);
  const baseUniverse = filterUniverse(stocksWithFactors);

  const historyBatchSize = Math.max(8, Number(process.env.HISTORY_BATCH_SIZE ?? 10));
  const priorityCodes = [...new Set([...PRODUCTION_SMOKE_SYMBOLS, ...(process.env.HISTORY_PRIORITY_CODES ?? '').split(',').map(code => code.trim()).filter(Boolean)])];
  const { historiesByCode, diagnostics:historyDiagnostics } = await hydrateOfficialHistories(baseUniverse.included, { cachePath:pathFor('history-cache.json'), queuePath:pathFor('history-queue.json'), asOf, batchSize:historyBatchSize, priorityCodes });

  const stocksWithTechnical = applyTechnicalBatch(baseUniverse.included, historiesByCode);
  const universe = { included:stocksWithTechnical, excluded:baseUniverse.excluded, counts:baseUniverse.counts };
  const coverage = coverageReport(stocksWithTechnical);
  const partition = partitionByCoverage(stocksWithTechnical);
  historyDiagnostics.validDailyCount = coverage.dailyBars;
  historyDiagnostics.validWeeklyCount = coverage.weeklyBars;
  historyDiagnostics.missingFundamentalFields = missingFundamentalFields(stocksWithTechnical);
  historyDiagnostics.insufficientByReason = groupInsufficientReasons(partition.insufficient);
  console.log(JSON.stringify({ event:'history_pipeline_summary', ...historyDiagnostics }));

  const marketHistoryPath = pathFor('market-history.json');
  let marketHistory = await readMarketHistory(marketHistoryPath);
  try {
    const officialMarket = await loadOfficialMarket();
    const selected = officialMarket.twse.close !== null ? officialMarket.twse : officialMarket.tpex;
    if (selected.close !== null) marketHistory = await appendMarketSnapshot(marketHistoryPath, { date:asOf, ...selected, source:officialMarket.source });
  } catch (error) {
    console.error(JSON.stringify({ event:'market_history_error', error:error.message }));
  }
  const market = classifyMarket(historyInputs(marketHistory));
  const lists = buildLists(partition.eligible, market.mode);
  const result = {
    batchId, runAt:new Date().toISOString(), asOf, provider:loaded.status, factorSources, validation, coverage, historyDiagnostics,
    universe:universe.counts, market, marketMode:market.mode, insufficientData:partition.insufficient.map(stock => ({ code:stock.code, name:stock.name, market:stock.market, ...stock.eligibility })),
    scoredIneligible:0, ...lists
  };
  result.release = releaseGate(result, { officialRequired:true });
  await mkdir(dataDir, { recursive:true });
  await writeFile(pathFor('latest-scan.json'), JSON.stringify(result, null, 2));
  await appendScan(pathFor('scan-history.json'), result);
  await appendScan(pathFor('recommendation-history.json'), { asOf, modelVersion:'v3.0', recommendations:snapshotRecommendations(result) });
  console.log(JSON.stringify({ provider:result.provider, asOf, candidates:coverage.total, eligible:coverage.eligible, insufficient:coverage.insufficient, top3:result.top3.map(stock => `${stock.code} ${stock.name}`), release:result.release }, null, 2));
} finally {
  await releaseScanLock(lockPath);
}
