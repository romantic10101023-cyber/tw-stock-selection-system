import { getCachedHistory, readHistoryCache, writeHistoryCache } from './history-cache.mjs';
import { loadTwseHistory } from './price-history-provider.mjs';
import { loadTpexHistory } from './tpex-history-provider.mjs';
import { aggregateWeeklyBars, MIN_DAILY_BARS, MIN_WEEKLY_BARS } from './technical.mjs';

export const PRODUCTION_SMOKE_SYMBOLS = ['2330', '6488'];

export function selectHistoryRefreshQueue(stocks, cache, limit, priorityCodes = PRODUCTION_SMOKE_SYMBOLS) {
  const byCode = new Map(stocks.map(stock => [stock.code, stock]));
  const priority = priorityCodes.map(code => byCode.get(code)).filter(Boolean);
  const prioritySet = new Set(priority.map(stock => stock.code));
  const remaining = stocks.filter(stock => !prioritySet.has(stock.code)).sort((a, b) => {
    const count = (cache[a.code]?.bars?.length ?? 0) - (cache[b.code]?.bars?.length ?? 0);
    return count || a.code.localeCompare(b.code);
  });
  return [...priority, ...remaining].slice(0, Math.max(priority.length, limit));
}

export function groupInsufficientReasons(stocks = []) {
  const grouped = {};
  for (const stock of stocks) for (const reason of stock.eligibility?.reasons ?? stock.historyReasons ?? []) {
    const key = reason.replace(/：\d+\/\d+$/, '');
    grouped[key] = (grouped[key] ?? 0) + 1;
  }
  return grouped;
}

export async function hydrateOfficialHistories(stocks, { cachePath, asOf, limit = 20, priorityCodes = PRODUCTION_SMOKE_SYMBOLS, logger = console, loaders = { twse:loadTwseHistory, tpex:loadTpexHistory } } = {}) {
  const cache = await readHistoryCache(cachePath);
  const historiesByCode = {};
  for (const stock of stocks) {
    const cached = await getCachedHistory(cachePath, stock.code, asOf);
    if (cached) historiesByCode[stock.code] = cached;
  }
  const queue = selectHistoryRefreshQueue(stocks, cache, limit, priorityCodes);
  const diagnostics = {
    universeCount:stocks.length, cachedCount:Object.keys(historiesByCode).length, refreshQueue:queue.map(stock => stock.code),
    stockSuccessCount:0, stockFailureCount:0, monthRequestSuccessCount:0, monthRequestFailureCount:0, stocks:[]
  };
  for (const stock of queue) {
    const existingBars = historiesByCode[stock.code]?.bars ?? [];
    try {
      const loader = loaders[stock.market];
      if (!loader) throw new Error(`Unsupported market mapping: ${stock.market}`);
      const history = await loader(stock.code, asOf, { existingBars });
      const failedMonths = history.errors.filter(entry => entry.error).length;
      const rejectedRows = history.errors.reduce((sum, entry) => sum + (entry.rejectedRows ?? 0), 0);
      const requestedMonths = Number(history.requestedMonths ?? 0);
      diagnostics.monthRequestFailureCount += failedMonths;
      diagnostics.monthRequestSuccessCount += Math.max(0, requestedMonths - failedMonths);
      const source = failedMonths ? (existingBars.length ? 'cached' : 'missing') : 'live';
      const effective = { ...history, source };
      historiesByCode[stock.code] = effective;
      await writeHistoryCache(cachePath, stock.code, effective, asOf);
      const dailyBars = effective.bars.length;
      const weeklyBars = aggregateWeeklyBars(effective.bars).length;
      diagnostics.stockSuccessCount += 1;
      const row = { code:stock.code, market:stock.market, source, requestedMonths, failedMonths, rejectedRows, dailyBars, weeklyBars, passesHistoryGate:dailyBars >= MIN_DAILY_BARS && weeklyBars >= MIN_WEEKLY_BARS };
      diagnostics.stocks.push(row);
      logger.log?.(JSON.stringify({ event:'history_pipeline_stock', ...row }));
    } catch (error) {
      diagnostics.stockFailureCount += 1;
      diagnostics.stocks.push({ code:stock.code, market:stock.market, error:error.message, dailyBars:existingBars.length, weeklyBars:aggregateWeeklyBars(existingBars).length, passesHistoryGate:false });
      logger.error?.(JSON.stringify({ event:'history_unavailable', code:stock.code, market:stock.market, error:error.message }));
    }
  }
  return { historiesByCode, diagnostics };
}
