import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getCachedHistory, readHistoryCache, writeHistoryCache } from './history-cache.mjs';
import { loadTwseHistory } from './price-history-provider.mjs';
import { loadTpexHistory } from './tpex-history-provider.mjs';
import { aggregateWeeklyBars, MIN_DAILY_BARS, MIN_WEEKLY_BARS } from './technical.mjs';

export const PRODUCTION_SMOKE_SYMBOLS = ['2330', '6488'];

export function selectHistoryRefreshQueue(stocks, cache, limit = stocks.length, priorityCodes = PRODUCTION_SMOKE_SYMBOLS) {
  const byCode = new Map(stocks.map(stock => [stock.code, stock]));
  const priority = priorityCodes.map(code => byCode.get(code)).filter(Boolean);
  const prioritySet = new Set(priority.map(stock => stock.code));
  const remaining = stocks.filter(stock => !prioritySet.has(stock.code)).sort((a, b) => {
    const count = (cache[a.code]?.bars?.length ?? 0) - (cache[b.code]?.bars?.length ?? 0);
    return count || a.code.localeCompare(b.code);
  });
  return [...priority, ...remaining].slice(0, Math.max(priority.length, limit));
}

async function readQueue(path) {
  if (!path) return null;
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function writeQueue(path, state) {
  if (!path) return;
  await mkdir(dirname(path), { recursive:true });
  await writeFile(path, JSON.stringify({ ...state, updatedAt:new Date().toISOString() }, null, 2));
}
const universeKey = stocks => stocks.map(stock => `${stock.market}:${stock.code}`).sort().join('|');

export function groupInsufficientReasons(stocks = []) {
  const grouped = {};
  for (const stock of stocks) for (const reason of stock.eligibility?.reasons ?? stock.historyReasons ?? []) {
    const key = reason.replace(/\s+\d+\/\d+$/, '');
    grouped[key] = (grouped[key] ?? 0) + 1;
  }
  return grouped;
}

export async function hydrateOfficialHistories(stocks, {
  cachePath, queuePath, asOf, batchSize = 10, priorityCodes = PRODUCTION_SMOKE_SYMBOLS,
  logger = console, loaders = { twse:loadTwseHistory, tpex:loadTpexHistory }
} = {}) {
  const cache = await readHistoryCache(cachePath);
  const historiesByCode = {};
  for (const stock of stocks) {
    const cached = await getCachedHistory(cachePath, stock.code, asOf);
    if (cached) historiesByCode[stock.code] = cached;
  }

  const signature = universeKey(stocks);
  let checkpoint = await readQueue(queuePath);
  if (!checkpoint || checkpoint.asOf !== asOf) {
    checkpoint = { version:1, asOf, universeKey:signature, total:stocks.length, pending:selectHistoryRefreshQueue(stocks, cache, stocks.length, priorityCodes).map(stock => stock.code), processed:[], succeeded:[], failed:[] };
    await writeQueue(queuePath, checkpoint);
  } else if (checkpoint.universeKey !== signature) {
    const active = new Set(stocks.map(stock => stock.code));
    checkpoint.pending = checkpoint.pending.filter(code => active.has(code));
    checkpoint.processed = checkpoint.processed.filter(code => active.has(code));
    checkpoint.succeeded = checkpoint.succeeded.filter(code => active.has(code));
    checkpoint.failed = checkpoint.failed.filter(code => active.has(code));
    const known = new Set([...checkpoint.pending, ...checkpoint.processed]);
    const additions = selectHistoryRefreshQueue(stocks.filter(stock => !known.has(stock.code)), cache, stocks.length, priorityCodes).map(stock => stock.code);
    checkpoint.pending.push(...additions);
    checkpoint.universeKey = signature;
    checkpoint.total = stocks.length;
    await writeQueue(queuePath, checkpoint);
  }
  const byCode = new Map(stocks.map(stock => [stock.code, stock]));
  const queue = (queuePath ? checkpoint.pending : selectHistoryRefreshQueue(stocks, cache, batchSize, priorityCodes).map(stock => stock.code))
    .slice(0, Math.max(1, batchSize)).map(code => byCode.get(code)).filter(Boolean);
  const diagnostics = {
    universeCount:stocks.length, cachedCount:Object.keys(historiesByCode).length,
    historyQueueTotal:checkpoint.total, historyQueueProcessed:checkpoint.processed.length,
    historyQueueRemaining:checkpoint.pending.length, batchSize, refreshQueue:queue.map(stock => stock.code),
    stockSuccessCount:0, stockFailureCount:0, monthRequestSuccessCount:0, monthRequestFailureCount:0, stocks:[]
  };

  for (const stock of queue) {
    const existingBars = historiesByCode[stock.code]?.bars ?? [];
    let succeeded = false;
    try {
      const loader = loaders[stock.market];
      if (!loader) throw new Error(`Unsupported market mapping: ${stock.market}`);
      const history = await loader(stock.code, asOf, { existingBars });
      const failedMonths = history.errors.filter(entry => entry.error).length;
      const rejectedRows = history.errors.reduce((sum, entry) => sum + (entry.rejectedRows ?? 0), 0);
      const requestedMonths = Number(history.requestedMonths ?? 0);
      diagnostics.monthRequestFailureCount += failedMonths;
      diagnostics.monthRequestSuccessCount += Math.max(0, requestedMonths - failedMonths);
      const source = failedMonths ? (history.bars.length || existingBars.length ? 'cached-partial' : 'missing') : 'live';
      const effective = { ...history, source };
      if (effective.bars.length) {
        historiesByCode[stock.code] = effective;
        await writeHistoryCache(cachePath, stock.code, effective, asOf);
      }
      const bars = historiesByCode[stock.code]?.bars ?? existingBars;
      const dailyBars = bars.length, weeklyBars = aggregateWeeklyBars(bars).length;
      succeeded = dailyBars >= MIN_DAILY_BARS && weeklyBars >= MIN_WEEKLY_BARS;
      diagnostics.stockSuccessCount += 1;
      const row = { code:stock.code, market:stock.market, source, requestedMonths, failedMonths, rejectedRows, dailyBars, weeklyBars, passesHistoryGate:succeeded };
      diagnostics.stocks.push(row);
      logger.log?.(JSON.stringify({ event:'history_pipeline_stock', ...row }));
    } catch (error) {
      diagnostics.stockFailureCount += 1;
      const dailyBars = existingBars.length, weeklyBars = aggregateWeeklyBars(existingBars).length;
      succeeded = dailyBars >= MIN_DAILY_BARS && weeklyBars >= MIN_WEEKLY_BARS;
      diagnostics.stocks.push({ code:stock.code, market:stock.market, error:error.message, dailyBars, weeklyBars, passesHistoryGate:succeeded });
      logger.error?.(JSON.stringify({ event:'history_unavailable', code:stock.code, market:stock.market, error:error.message }));
    } finally {
      checkpoint.pending = checkpoint.pending.filter(code => code !== stock.code);
      if (!checkpoint.processed.includes(stock.code)) checkpoint.processed.push(stock.code);
      const target = succeeded ? 'succeeded' : 'failed';
      if (!checkpoint[target].includes(stock.code)) checkpoint[target].push(stock.code);
      await writeQueue(queuePath, checkpoint);
    }
  }
  diagnostics.historyQueueProcessed = checkpoint.processed.length;
  diagnostics.historyQueueRemaining = checkpoint.pending.length;
  diagnostics.historySuccessCount = checkpoint.succeeded.length;
  diagnostics.historyFailureCount = checkpoint.failed.length;
  return { historiesByCode, diagnostics, checkpoint };
}
