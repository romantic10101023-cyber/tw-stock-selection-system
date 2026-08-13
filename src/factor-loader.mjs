import { fetchOfficialJson } from './live-provider.mjs';
import { mergeFactors, parseIncome, parseInstitutions, parseMargin, parsePe, parseRevenue } from './factor-provider.mjs';

const SOURCES = {
  revenue: 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L',
  income: 'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci',
  pe: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis',
  margin: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance',
  institutions: 'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading'
};

async function load(url) {
  const payload = await fetchOfficialJson(url);
  return Array.isArray(payload) ? payload : [];
}

async function loadSafe(name, url) {
  try { return { name, rows: await load(url), ok:true, error:null }; }
  catch (error) { return { name, rows:[], ok:false, error:error.message }; }
}

export async function loadOfficialFactors() {
  const result = await loadOfficialFactorsDetailed();
  return result.factors;
}

export async function loadOfficialFactorsDetailed() {
  const results = [];
  for (const [name, url] of Object.entries(SOURCES)) results.push(await loadSafe(name, url));
  const rows = Object.fromEntries(results.map(result => [result.name, result.rows]));
  const revenue = parseRevenue(rows.revenue);
  const income = parseIncome(rows.income);
  const valuation = parsePe(rows.pe);
  const chips = mergeFactors(parseMargin(rows.margin), parseInstitutions(rows.institutions));
  const codes = new Set([...Object.keys(revenue), ...Object.keys(income), ...Object.keys(valuation), ...Object.keys(chips)]);
  return {
    factors:Object.fromEntries([...codes].map(code => [code, { revenue:revenue[code], income:income[code], valuation:valuation[code], chips:chips[code] }])),
    sources:Object.fromEntries(results.map(result => [result.name, { ok:result.ok, rows:result.rows.length, error:result.error }]))
  };
}
