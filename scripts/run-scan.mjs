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
import { loadTwseHistory } from '../src/price-history-provider.mjs';
import { loadTpexHistory } from '../src/tpex-history-provider.mjs';
import { loadOfficialFactorsDetailed } from '../src/factor-loader.mjs';
import { enrichBatch } from '../src/enrich.mjs';
import { coverageReport, partitionByCoverage } from '../src/data-coverage.mjs';
import { getCachedHistory, readHistoryCache, writeHistoryCache } from '../src/history-cache.mjs';
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

  const historyCachePath = pathFor('history-cache.json');
  const historyCache = await readHistoryCache(historyCachePath);
  const historiesByCode = {};
  for (const stock of stocksWithFactors) {
    const cached = await getCachedHistory(historyCachePath, stock.code, asOf);
    if (cached) historiesByCode[stock.code] = cached;
  }

  const historyLimit = Math.max(1, Number(process.env.HISTORY_LIMIT ?? 20));
  const refreshQueue = [...stocksWithFactors]
    .sort((a, b) => (historyCache[a.code]?.bars?.length ?? 0) - (historyCache[b.code]?.bars?.length ?? 0))
    .slice(0, historyLimit);
  for (const stock of refreshQueue) {
    const existingBars = historiesByCode[stock.code]?.bars ?? [];
    try {
      const history = stock.market === 'tpex'
        ? await loadTpexHistory(stock.code, asOf, { existingBars })
        : await loadTwseHistory(stock.code, asOf, { existingBars });
      const requestFailed = history.errors.some(entry => entry.error);
      const effective = { ...history, source:requestFailed ? (existingBars.length ? 'cached' : 'missing') : 'live' };
      historiesByCode[stock.code] = effective;
      await writeHistoryCache(historyCachePath, stock.code, effective, asOf);
    } catch (error) {
      console.error(JSON.stringify({ event:'history_unavailable', code:stock.code, market:stock.market, error:error.message }));
    }
  }

  const stocksWithTechnical = applyTechnicalBatch(stocksWithFactors, historiesByCode);
  const universe = filterUniverse(stocksWithTechnical);
  const coverage = coverageReport(universe.included);
  const partition = partitionByCoverage(universe.included);

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
    batchId, runAt:new Date().toISOString(), asOf, provider:loaded.status, factorSources, validation, coverage,
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
