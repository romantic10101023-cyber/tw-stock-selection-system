import { fetchOfficialJson } from './live-provider.mjs';
import { mergeBars, normalizeOfficialRows, validBar } from './ohlcv.mjs';
import { aggregateWeeklyBars } from './technical.mjs';
import { HISTORY_MONTHS, historyRequestMonths } from './price-history-provider.mjs';

export const TPEX_HISTORY_URL = 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock';

function parseRocDate(value) {
  const match = String(value ?? '').match(/(\d{2,3})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return match ? `${Number(match[1]) + 1911}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}` : null;
}

export function parseTpexHistory(payload, { code, asOf, logger } = {}) {
  const rows = payload?.tables?.[0]?.data;
  if (!Array.isArray(rows)) return [];
  return normalizeOfficialRows({ rows, fields:payload?.tables?.[0]?.fields, code, market:'tpex', asOf, logger, dateParser:parseRocDate }).bars;
}

export async function loadTpexHistory(code, asOf = new Date().toISOString().slice(0, 10), { existingBars = [], months = HISTORY_MONTHS, fetchJson = fetchOfficialJson, logger = console, signal } = {}) {
  let bars = mergeBars([], existingBars.filter(bar => validBar(bar, asOf).ok));
  const currentMonth = asOf.slice(0, 7);
  const cachedMonths = new Set(bars.map(bar => bar.date?.slice(0, 7)).filter(Boolean));
  const errors = [];
  const requests = historyRequestMonths(asOf, months).filter(request => {
    const key = `${request.year}-${String(request.month).padStart(2, '0')}`;
    return !cachedMonths.has(key) || key === currentMonth;
  });
  for (const request of requests) {
    if(signal?.aborted) throw signal.reason??new Error('stock processing deadline exceeded');
    const key = `${request.year}-${String(request.month).padStart(2, '0')}`;
    if (cachedMonths.has(key) && key !== currentMonth) continue;
    try {
      const body = new URLSearchParams({ code, date:`${request.year}/${String(request.month).padStart(2, '0')}/01`, response:'json' });
      const payload = await fetchJson(TPEX_HISTORY_URL, { method:'POST', body, timeoutMs:12_000, attempts:1, signal });
      if (payload?.stat !== 'ok') throw new Error(payload?.stat ?? 'Invalid TPEX response');
      const table = payload?.tables?.[0];
      const normalized = normalizeOfficialRows({ rows:table?.data, fields:table?.fields, code, market:'tpex', asOf, logger, dateParser:parseRocDate });
      bars = mergeBars(bars, normalized.bars);
      if (normalized.rejected.length) errors.push({ month:key, rejectedRows:normalized.rejected.length });
    } catch (error) {
      errors.push({ month:key, error:error.message });
      logger.error?.(JSON.stringify({ event:'history_fetch_error', market:'tpex', code, month:key, error:error.message }));
    }
  }
  bars = bars.filter(bar => bar.date <= asOf);
  return { code, bars, dailyBars:bars.length, weeklyBars:aggregateWeeklyBars(bars).length, requestedMonths:requests.length, source:'live', asOf, errors };
}
