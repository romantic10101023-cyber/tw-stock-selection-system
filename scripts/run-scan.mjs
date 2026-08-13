import { mkdir, writeFile } from 'node:fs/promises';
import { buildLists } from '../src/engine.mjs';
import { demoStocks } from '../src/demo-data.mjs';
import { validateBatch } from '../src/data-model.mjs';
import { createProvider } from '../src/provider.mjs';
import { appendScan } from '../src/storage.mjs';
import { loadOfficialQuotes } from '../src/live-provider.mjs';
import { createFileCache } from '../src/cache-provider.mjs';
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
import { coverageReport } from '../src/data-coverage.mjs';
import { getCachedHistory, writeHistoryCache } from '../src/history-cache.mjs';
import { acquireScanLock, releaseScanLock } from '../src/scan-lock.mjs';
import { releaseGate } from '../src/release-gate.mjs';

const asOf = process.env.MARKET_DATE ?? new Date().toISOString().slice(0, 10);
const lockPath = 'data/scan.lock';
if (!await acquireScanLock(lockPath)) throw new Error('已有另一個掃描程序執行中');
const batchId = `scan-${Date.now()}-${process.pid}`;
process.on('exit', () => { releaseScanLock(lockPath).catch(() => {}); });
const provider = createProvider({ liveLoader: process.env.USE_OFFICIAL_DATA === '1' ? loadOfficialQuotes : undefined, cachedLoader: createFileCache('data/quotes-cache.json'), demoLoader: async () => demoStocks });
const loaded = await provider.load(asOf);
const validation = validateBatch(loaded.stocks, asOf);
if (!validation.ok) throw new Error(validation.errors.join('; '));
let factorMap = {};
let factorSources = {};
if (process.env.USE_OFFICIAL_DATA === '1') {
  try { const factorResult = await loadOfficialFactorsDetailed(); factorMap = factorResult.factors; factorSources = factorResult.sources; }
  catch (error) { console.warn(`factor provider unavailable: ${error.message}`); }
}
const stocksWithFactors = enrichBatch(loaded.stocks, factorMap);
const barsByCode = {};
if (process.env.USE_OFFICIAL_DATA === '1') {
  const historyCachePath = 'data/history-cache.json';
  for (const stock of stocksWithFactors.slice(0, Number(process.env.HISTORY_LIMIT ?? 20))) {
    try {
      const cached = await getCachedHistory(historyCachePath, stock.code, asOf);
      const history = cached ?? (stock.market === 'tpex' ? await loadTpexHistory(stock.code, asOf) : await loadTwseHistory(stock.code, asOf));
      barsByCode[stock.code] = history.bars;
      if (!cached) await writeHistoryCache(historyCachePath, stock.code, history, asOf);
    } catch (error) { console.warn(`history unavailable ${stock.code}: ${error.message}`); }
  }
}
const stocksWithTechnical = applyTechnicalBatch(stocksWithFactors, barsByCode);
const universe = filterUniverse(stocksWithTechnical);
const coverage = coverageReport(stocksWithTechnical);
const marketHistoryPath = 'data/market-history.json';
let marketHistory = await readMarketHistory(marketHistoryPath);
if (process.env.USE_OFFICIAL_DATA === '1') {
  try {
    const officialMarket = await loadOfficialMarket();
    const selected = officialMarket.twse.close !== null ? officialMarket.twse : officialMarket.tpex;
    if (selected.close !== null) marketHistory = await appendMarketSnapshot(marketHistoryPath, { date: asOf, ...selected, source: officialMarket.source });
  } catch (error) { console.warn(`market provider unavailable: ${error.message}`); }
}
const market = classifyMarket(historyInputs(marketHistory));
const result = { batchId, runAt: new Date().toISOString(), asOf, provider: loaded.status, factorSources, validation, coverage, universe: universe.counts, market, marketMode: market.mode, ...buildLists(universe.included, market.mode) };
result.release = releaseGate(result, { officialRequired: process.env.USE_OFFICIAL_DATA === '1' });
await mkdir('data', { recursive: true });
await writeFile('data/latest-scan.json', JSON.stringify(result, null, 2));
await appendScan('data/scan-history.json', result);
await appendScan('data/recommendation-history.json', { asOf, modelVersion:'v1.2', recommendations:snapshotRecommendations(result) });
await releaseScanLock(lockPath);
console.log(JSON.stringify({ provider: result.provider, asOf, count: result.ranked.length, top3: result.top3.map(x => `${x.code} ${x.name}`) }, null, 2));
