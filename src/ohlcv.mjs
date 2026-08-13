const number = value => { const n = Number(String(value ?? '').replaceAll(',', '')); return Number.isFinite(n) ? n : null; };

export function normalizeBar(raw = {}) {
  return {
    date: raw.date ?? raw.Date ?? raw['日期'] ?? null,
    open: number(raw.open ?? raw.Open ?? raw['開盤價']),
    high: number(raw.high ?? raw.High ?? raw['最高價']),
    low: number(raw.low ?? raw.Low ?? raw['最低價']),
    close: number(raw.close ?? raw.Close ?? raw['收盤價']),
    volume: number(raw.volume ?? raw.Volume ?? raw['成交量'])
  };
}

export function validateBars(bars, asOf) {
  const errors = [];
  for (const bar of bars) {
    if (!bar.date || ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite)) errors.push('K線欄位不完整');
    if (bar.date > asOf) errors.push('K線日期晚於市場日期');
    if (bar.high < bar.low || bar.high < bar.open || bar.high < bar.close || bar.low > bar.open || bar.low > bar.close) errors.push(`${bar.date} OHLC關係錯誤`);
  }
  return { ok: errors.length === 0, errors, count: bars.length };
}

export function mergeBars(existing, incoming) {
  const map = new Map(existing.map(bar => [bar.date, bar]));
  for (const bar of incoming) map.set(bar.date, bar);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
