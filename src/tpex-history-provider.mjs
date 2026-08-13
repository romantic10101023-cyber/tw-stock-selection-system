import { fetchOfficialJson } from './live-provider.mjs';
import { mergeBars, normalizeBar, validateBars } from './ohlcv.mjs';
import { aggregateWeeklyBars } from './technical.mjs';
import { HISTORY_MONTHS, historyRequestMonths } from './price-history-provider.mjs';

export const TPEX_HISTORY_URL = 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock';

function parseRocDate(value) {
  const match = String(value ?? '').match(/(\d{2,3})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return match ? `${Number(match[1]) + 1911}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}` : null;
}

export function parseTpexHistory(payload) {
  const rows = payload?.tables?.[0]?.data;
  if (!Array.isArray(rows)) return [];
  return rows.map(row => normalizeBar({ date:parseRocDate(row[0]), open:row[3], high:row[4], low:row[5], close:row[6], volume:row[1] })).filter(bar => bar.date);
}

export async function loadTpexHistory(code, asOf = new Date().toISOString().slice(0, 10), { existingBars = [], months = HISTORY_MONTHS, fetchJson = fetchOfficialJson, logger = console } = {}) {
  let bars = mergeBars([], existingBars);
  const currentMonth = asOf.slice(0, 7);
  const cachedMonths = new Set(bars.map(bar => bar.date?.slice(0, 7)).filter(Boolean));
  const errors = [];
  for (const request of historyRequestMonths(asOf, months)) {
    const key = `${request.year}-${String(request.month).padStart(2, '0')}`;
    if (cachedMonths.has(key) && key !== currentMonth) continue;
    try {
      const body = new URLSearchParams({ code, date:`${request.year}/${String(request.month).padStart(2, '0')}/01`, response:'json' });
      const payload = await fetchJson(TPEX_HISTORY_URL, { method:'POST', body });
      if (payload?.stat !== 'ok') throw new Error(payload?.stat ?? 'Invalid TPEX response');
      bars = mergeBars(bars, parseTpexHistory(payload));
    } catch (error) {
      errors.push({ month:key, error:error.message });
      logger.error?.(JSON.stringify({ event:'history_fetch_error', market:'tpex', code, month:key, error:error.message }));
    }
  }
  bars = bars.filter(bar => bar.date <= asOf);
  const validation = validateBars(bars, asOf);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  return { code, bars, dailyBars:bars.length, weeklyBars:aggregateWeeklyBars(bars).length, source:'live', asOf, errors };
}
