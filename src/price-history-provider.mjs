import { fetchOfficialJson } from './live-provider.mjs';
import { mergeBars, normalizeBar, validateBars } from './ohlcv.mjs';

export const HISTORY_MONTHS = 18;
const TWSE_HISTORY = (code, year, month) => `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${year}${String(month).padStart(2, '0')}01&stockNo=${code}&response=json`;

function monthsBefore(asOf, count) {
  const end = new Date(`${asOf}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (count - 1 - index), 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  });
}

function parseRocDate(value) {
  const match = String(value ?? '').match(/^(\d{2,3})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return null;
  return `${Number(match[1]) + 1911}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
}

export async function loadTwseHistory(code, asOf = '2026-08-13') {
  let bars = [];
  for (const { year, month } of monthsBefore(asOf, HISTORY_MONTHS)) {
    const payload = await fetchOfficialJson(TWSE_HISTORY(code, year, month));
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    bars = mergeBars(bars, rows.map(row => normalizeBar({ date: parseRocDate(row[0]) ?? row[0], open:row[3], high:row[4], low:row[5], close:row[6], volume:row[1] })));
  }
  const validation = validateBars(bars, asOf);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  if (bars.length < 120) throw new Error(`${code} 日線不足120根，目前${bars.length}根`);
  return { code, bars, dailyBars: bars.length, weeklyBars: Math.floor(bars.length / 5), source:'live', asOf };
}

export function historyRequestMonths(asOf = '2026-08-13', count = HISTORY_MONTHS) { return monthsBefore(asOf, count); }
