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
  const recent = closes.slice(1).map((value, index) => Number(value) - Number(closes[index])).slice(-period);
  const gains = avg(recent.filter(x => x > 0)) ?? 0;
  const losses = avg(recent.filter(x => x < 0).map(Math.abs)) ?? 0;
  if (losses === 0) return gains > 0 ? 100 : 50;
  return 100 - 100 / (1 + gains / losses);
}

export function supportLevel(bars, lookback = 60) {
  const lows = bars.slice(-lookback).map(bar => finite(bar.low)).filter(value => value !== null);
  return lows.length ? Math.min(...lows) : null;
}

export function aggregateWeeklyBars(dailyBars = []) {
  const groups = new Map();
  for (const bar of [...dailyBars].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date ?? '')) continue;
    const date = new Date(`${bar.date}T00:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    const week = date.toISOString().slice(0, 10);
    const current = groups.get(week);
    if (!current) groups.set(week, { date:week, open:Number(bar.open), high:Number(bar.high), low:Number(bar.low), close:Number(bar.close), volume:Number(bar.volume) });
    else {
      current.high = Math.max(current.high, Number(bar.high));
      current.low = Math.min(current.low, Number(bar.low));
      current.close = Number(bar.close);
      current.volume += Number(bar.volume);
    }
  }
  return [...groups.values()];
}

export function deriveTechnical(bars, minimumBars = MIN_DAILY_BARS, label = '日線') {
  if (!Array.isArray(bars) || bars.length < minimumBars) return { complete:false, count:bars?.length ?? 0, reason:`${label}至少需要 ${minimumBars} 根 K 棒` };
  const closes = bars.map(bar => Number(bar.close));
  const volumes = bars.map(bar => Number(bar.volume));
  const price = closes.at(-1);
  const ma5 = sma(closes, 5), ma20 = sma(closes, 20), ma60 = sma(closes, 60);
  const volume5 = sma(volumes, 5), volume20 = sma(volumes, 20);
  const support = supportLevel(bars);
  return {
    complete:true, count:bars.length, price, ma5, ma20, ma60, volume5, volume20, rsi14:rsi(closes), support,
    stop:support ? support * 0.97 : null,
    aboveSeasonal:ma60 !== null ? price >= ma60 : false,
    weekTrendUp:ma20 !== null && ma5 !== null ? ma5 >= ma20 : false,
    nearSupport:support ? price <= support * 1.08 && price >= support * 0.97 : false,
    volumeContracting:volume20 !== null && volume5 !== null ? volume5 <= volume20 : false,
    reclaim20ma:ma20 !== null ? price >= ma20 : false,
    breakdown:support !== null ? price < support * 0.97 : false,
    overextended:ma20 !== null ? price > ma20 * 1.18 : false
  };
}

export function deriveWeeklyTechnical(dailyBars) {
  const weeks = aggregateWeeklyBars(dailyBars);
  const technical = deriveTechnical(weeks, MIN_WEEKLY_BARS, '週線');
  return { ...technical, bars:weeks };
}
