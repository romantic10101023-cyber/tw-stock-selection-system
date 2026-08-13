import { SOURCE_STATUS } from './data-model.mjs';

const ENDPOINTS = {
  twseRevenue: 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L',
  twseIncome: 'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci',
  twseBalance: 'https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci',
  tpexPe: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis',
  tpexMargin: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance',
  tpexInstitutions: 'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading'
};

const key = row => String(row.公司代號 ?? row.證券代號 ?? row.SecuritiesCompanyCode ?? row.Code ?? '').padStart(4, '0');
const numeric = value => { const n = Number(String(value ?? '').replaceAll(',', '').replaceAll('%', '')); return Number.isFinite(n) ? n : null; };
const pick = (row, names) => { for (const name of names) if (row[name] !== undefined && row[name] !== '') return numeric(row[name]); return null; };

export function parseRevenue(rows = []) {
  return Object.fromEntries(rows.map(row => [key(row), { revenue: pick(row, ['當月營收', '營業收入-當月營收']), revenueYoY: pick(row, ['去年同月增減(%)', '營收年增率']), source: SOURCE_STATUS.LIVE }]));
}

export function parseIncome(rows = []) {
  return Object.fromEntries(rows.map(row => [key(row), { eps: pick(row, ['基本每股盈餘（元）', '基本每股盈餘']), grossMargin: pick(row, ['營業毛利率(%)', '營業毛利率']), operatingMargin: pick(row, ['營業利益率(%)', '營業利益率']), source: SOURCE_STATUS.LIVE }]));
}

export function parsePe(rows = []) {
  return Object.fromEntries(rows.map(row => [key(row), { pe: pick(row, ['本益比', 'P/E']), pb: pick(row, ['股價淨值比', 'P/B']), yield: pick(row, ['殖利率(%)', '殖利率']), source: SOURCE_STATUS.LIVE }]));
}

export function parseMargin(rows = []) {
  return Object.fromEntries(rows.map(row => [key(row), { marginBalance: pick(row, ['融資餘額', 'MarginBalance']), shortBalance: pick(row, ['融券餘額', 'ShortBalance']), marginChange: pick(row, ['融資餘額增減', 'MarginChange']), shortChange: pick(row, ['融券餘額增減', 'ShortChange']), source: SOURCE_STATUS.LIVE }]));
}

export function parseInstitutions(rows = []) {
  return Object.fromEntries(rows.map(row => [key(row), { foreignNet: pick(row, ['外陸資買賣超股數', '外資及陸資買賣超股數', 'ForeignNet']), trustNet: pick(row, ['投信買賣超股數', 'InvestmentTrustNet']), dealerNet: pick(row, ['自營商買賣超股數', 'DealerNet']), source: SOURCE_STATUS.LIVE }]));
}

export function mergeFactors(...maps) {
  const codes = new Set(maps.flatMap(map => Object.keys(map)));
  return Object.fromEntries([...codes].map(code => [code, Object.assign({ code }, ...maps.map(map => map[code] ?? {}))]));
}

export function factorEndpoints() { return { ...ENDPOINTS }; }
