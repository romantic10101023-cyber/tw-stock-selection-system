const MISSING_VALUES = new Set(['', '--', '---', 'null', 'undefined', 'N/A']);

export function parseOfficialNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (MISSING_VALUES.has(text)) return null;
  const normalized = text.replaceAll(',', '').replace(/[＋+]/g, '').replace(/[－−]/g, '-');
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function normalizeBar(raw = {}) {
  return {
    date:raw.date ?? raw.Date ?? raw['日期'] ?? raw['日 期'] ?? null,
    open:parseOfficialNumber(raw.open ?? raw.Open ?? raw['開盤價'] ?? raw['開盤']),
    high:parseOfficialNumber(raw.high ?? raw.High ?? raw['最高價'] ?? raw['最高']),
    low:parseOfficialNumber(raw.low ?? raw.Low ?? raw['最低價'] ?? raw['最低']),
    close:parseOfficialNumber(raw.close ?? raw.Close ?? raw['收盤價'] ?? raw['收盤']),
    volume:parseOfficialNumber(raw.volume ?? raw.Volume ?? raw['成交股數'] ?? raw['成交張數'])
  };
}

export function barMissingFields(bar) {
  const missing = [];
  if (!bar?.date) missing.push('date');
  for (const field of ['open','high','low','close']) if (!Number.isFinite(bar?.[field])) missing.push(field);
  return missing;
}

export function validBar(bar, asOf) {
  const missingFields = barMissingFields(bar);
  const errors = [];
  if (missingFields.length) errors.push(`missing: ${missingFields.join(', ')}`);
  if (bar?.date && asOf && bar.date > asOf) errors.push('future date');
  if (!missingFields.some(field => ['open','high','low','close'].includes(field)) && (bar.high < bar.low || bar.high < bar.open || bar.high < bar.close || bar.low > bar.open || bar.low > bar.close)) errors.push('invalid OHLC relationship');
  return { ok:errors.length === 0, missingFields, errors };
}

export function validateBars(bars, asOf) {
  const errors = [];
  bars.forEach((bar, index) => {
    const result = validBar(bar, asOf);
    if (!result.ok) errors.push(`row ${index} (${bar?.date ?? 'unknown'}): ${result.errors.join('; ')}`);
  });
  return { ok:errors.length === 0, errors, count:bars.length };
}

export function mergeBars(existing = [], incoming = []) {
  const map = new Map();
  for (const bar of [...existing, ...incoming]) if (bar?.date) map.set(bar.date, bar);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const normalizeField = field => String(field ?? '').replace(/\s+/g, '');
const FIELD_ALIASES = {
  date:['日期'], volume:['成交股數','成交張數'], open:['開盤價','開盤'], high:['最高價','最高'], low:['最低價','最低'], close:['收盤價','收盤']
};

export function normalizeOfficialRows({ rows = [], fields = [], code, market, asOf, logger = console, dateParser = value => value } = {}) {
  const normalizedFields = fields.map(normalizeField);
  const indexes = Object.fromEntries(Object.entries(FIELD_ALIASES).map(([key, aliases]) => [key, normalizedFields.findIndex(field => aliases.map(normalizeField).includes(field))]));
  const bars = [], rejected = [];
  rows.forEach((row, rowIndex) => {
    const raw = Object.fromEntries(Object.entries(indexes).map(([key, index]) => [key, index >= 0 ? row?.[index] : undefined]));
    raw.date = dateParser(raw.date);
    const bar = normalizeBar(raw);
    const validation = validBar(bar, asOf);
    if (validation.ok) bars.push(bar);
    else {
      const rejection = { rowIndex, date:bar.date ?? raw.date ?? null, missingFields:validation.missingFields, errors:validation.errors };
      rejected.push(rejection);
      logger.error?.(JSON.stringify({ event:'history_row_rejected', market, code, ...rejection }));
    }
  });
  return { bars, rejected, fieldIndexes:indexes };
}
