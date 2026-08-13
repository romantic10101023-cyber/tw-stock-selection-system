import { fetchOfficialJson } from './live-provider.mjs';
import { mergeBars, normalizeOfficialRows, validBar } from './ohlcv.mjs';
import { aggregateWeeklyBars } from './technical.mjs';

export const HISTORY_MONTHS = 18;
export const TWSE_HISTORY_URL = (code, year, month) => `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${year}${String(month).padStart(2, '0')}01&stockNo=${code}&response=json`;

function monthsBefore(asOf, count) {
  const end = new Date(`${asOf}T00:00:00Z`);
  return Array.from({ length:count }, (_, index) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (count - 1 - index), 1));
    return { year:date.getUTCFullYear(), month:date.getUTCMonth() + 1 };
  });
}

function parseRocDate(value) {
  const match = String(value ?? '').match(/^(\d{2,3})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  return match ? `${Number(match[1]) + 1911}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}` : null;
}

const monthKey = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

export async function loadTwseHistory(code, asOf = new Date().toISOString().slice(0, 10), { existingBars = [], months = HISTORY_MONTHS, fetchJson = fetchOfficialJson, logger = console } = {}) {
  let bars = mergeBars([], existingBars.filter(bar => validBar(bar, asOf).ok));
  const currentMonth = asOf.slice(0, 7);
  const cachedMonths = new Set(bars.map(bar => bar.date?.slice(0, 7)).filter(Boolean));
  const errors = [];
  const requests = monthsBefore(asOf, months).filter(request => !cachedMonths.has(monthKey(request)) || monthKey(request) === currentMonth);
  for (const request of requests) {
    const key = monthKey(request);
    if (cachedMonths.has(key) && key !== currentMonth) continue;
    try {
      const payload = await fetchJson(TWSE_HISTORY_URL(code, request.year, request.month));
      if (payload?.stat && payload.stat !== 'OK') throw new Error(payload.stat);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const normalized = normalizeOfficialRows({ rows, fields:payload?.fields, code, market:'twse', asOf, logger, dateParser:value => parseRocDate(value) ?? value });
      bars = mergeBars(bars, normalized.bars);
      if (normalized.rejected.length) errors.push({ month:key, rejectedRows:normalized.rejected.length });
    } catch (error) {
      errors.push({ month:key, error:error.message });
      logger.error?.(JSON.stringify({ event:'history_fetch_error', market:'twse', code, month:key, error:error.message }));
    }
  }
  bars = bars.filter(bar => bar.date <= asOf);
  return { code, bars, dailyBars:bars.length, weeklyBars:aggregateWeeklyBars(bars).length, requestedMonths:requests.length, source:'live', asOf, errors };
}

export function historyRequestMonths(asOf = new Date().toISOString().slice(0, 10), count = HISTORY_MONTHS) { return monthsBefore(asOf, count); }
