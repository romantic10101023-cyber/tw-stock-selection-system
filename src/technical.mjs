const finite = n => Number.isFinite(Number(n)) ? Number(n) : null;
const avg = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export const MIN_DAILY_BARS = 120;
export const MIN_WEEKLY_BARS = 60;

export function sma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  return avg(values.slice(-period).map(Number));
}

export function rsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) return null;
  const changes = closes.slice(1).map((v, i) => Number(v) - Number(closes[i]));
  const recent = changes.slice(-period);
  const gains = avg(recent.filter(x => x > 0).map(x => x)) ?? 0;
  const losses = avg(recent.filter(x => x < 0).map(x => Math.abs(x))) ?? 0;
  if (losses === 0) return gains > 0 ? 100 : 50;
  return 100 - 100 / (1 + gains / losses);
}

export function supportLevel(bars, lookback = 60) {
  const lows = bars.slice(-lookback).map(x => finite(x.low)).filter(x => x !== null);
  if (!lows.length) return null;
  return Math.min(...lows);
}

export function deriveTechnical(bars, minimumBars = MIN_DAILY_BARS, label = '日線') {
  if (!Array.isArray(bars) || bars.length < minimumBars) return { complete: false, reason: `${label}至少需要${minimumBars}根K線` };
  const closes = bars.map(x => Number(x.close));
  const volumes = bars.map(x => Number(x.volume));
  const price = closes.at(-1);
  const ma5 = sma(closes, 5), ma20 = sma(closes, 20), ma60 = sma(closes, 60);
  const volume5 = sma(volumes, 5), volume20 = sma(volumes, 20);
  const support = supportLevel(bars);
  const stop = support ? support * 0.97 : null;
  const nearSupport = support ? price <= support * 1.08 && price >= support * 0.97 : false;
  return {
    complete: true,
    price, ma5, ma20, ma60, volume5, volume20, rsi14: rsi(closes), support, stop,
    aboveSeasonal: ma60 !== null ? price >= ma60 : false,
    weekTrendUp: ma20 !== null && ma5 !== null ? ma5 >= ma20 : false,
    nearSupport,
    volumeContracting: volume20 !== null && volume5 !== null ? volume5 <= volume20 : false,
    reclaim20ma: ma20 !== null ? price >= ma20 : false,
    breakdown: support !== null ? price < support * 0.97 : false,
    overextended: ma20 !== null ? price > ma20 * 1.18 : false
  };
}

export function deriveWeeklyTechnical(dailyBars) {
  if (!Array.isArray(dailyBars) || dailyBars.length < MIN_WEEKLY_BARS * 5) return { complete: false, reason: `週線至少需要${MIN_WEEKLY_BARS}根K線（約${MIN_WEEKLY_BARS * 5}個交易日）` };
  const weeks = [];
  for (let i = 0; i + 4 <= dailyBars.length; i += 5) {
    const group = dailyBars.slice(i, i + 5);
    weeks.push({ close: group.at(-1).close, low: Math.min(...group.map(x => x.low)), volume: group.reduce((s, x) => s + Number(x.volume), 0) });
  }
  if (weeks.length < MIN_WEEKLY_BARS) return { complete: false, reason: `週線至少需要${MIN_WEEKLY_BARS}根K線` };
  return deriveTechnical(weeks, MIN_WEEKLY_BARS, '週線');
}
