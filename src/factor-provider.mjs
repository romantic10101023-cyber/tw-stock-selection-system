import { SOURCE_STATUS } from './data-model.mjs';

const ENDPOINTS = {
  twseRevenue:'https://openapi.twse.com.tw/v1/opendata/t187ap05_L',
  twseIncomeCi:'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci',
  twseIncomeBank:'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_basi',
  twseIncomeBroker:'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_bd',
  twseIncomeHolding:'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_fh',
  twseIncomeInsurance:'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ins',
  twseIncomeMixed:'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_mim',
  twsePe:'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL',
  twseMargin:'https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN',
  tpexRevenue:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O',
  tpexIncomeCi:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_ci',
  tpexIncomeBank:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_basi',
  tpexIncomeBroker:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_bd',
  tpexIncomeHolding:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_fh',
  tpexIncomeInsurance:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_ins',
  tpexIncomeMixed:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_mim',
  tpexPe:'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis',
  tpexMargin:'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance',
  tpexInstitutions:'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading'
};

const codeOf = row => String(row['公司代號'] ?? row['證券代號'] ?? row['股票代號'] ?? row.SecuritiesCompanyCode ?? row.Code ?? '').trim().padStart(4, '0');
const numeric = value => {
  if (value === null || value === undefined || value === '' || value === '--') return null;
  const number = Number(String(value).replaceAll(',', '').replaceAll('%', '').trim());
  return Number.isFinite(number) ? number : null;
};
const pick = (row, names) => {
  for (const name of names) if (Object.hasOwn(row, name)) {
    const value = numeric(row[name]);
    if (value !== null) return value;
  }
  return null;
};
const entries = (rows, mapper) => rows.map(row => [codeOf(row), mapper(row)]).filter(([code]) => /^\d{4,6}$/.test(code));

export function parseRevenue(rows = []) {
  return Object.fromEntries(entries(rows, row => ({
    revenue:pick(row, ['營業收入-當月營收', '當月營收']),
    revenueYoY:pick(row, ['營業收入-去年同月增減(%)', '去年同月增減(%)']),
    cumulativeRevenueYoY:pick(row, ['累計營業收入-前期比較增減(%)', '前期比較增減(%)']),
    source:SOURCE_STATUS.LIVE
  })));
}

export function parseIncome(rows = []) {
  return Object.fromEntries(entries(rows, row => ({
    reportedEps:pick(row, ['基本每股盈餘（元）', '基本每股盈餘(元)', '基本每股盈餘']),
    grossMargin:pick(row, ['營業毛利（毛損）淨額', '營業毛利（毛損）']),
    operatingIncome:pick(row, ['營業利益（損失）']),
    period:String(row['年季'] ?? row['資料年月'] ?? ''),
    source:SOURCE_STATUS.LIVE
  })));
}

export function parsePe(rows = []) {
  return Object.fromEntries(entries(rows, row => ({ pe:pick(row, ['本益比', 'P/E', 'PEratio']), pb:pick(row, ['股價淨值比', 'P/B', 'PBratio']), yield:pick(row, ['殖利率(%)', '殖利率（%）', 'DividendYield']), source:SOURCE_STATUS.LIVE })));
}

export function parseMargin(rows = []) {
  return Object.fromEntries(entries(rows, row => {
    const previous = pick(row, ['融資前日餘額', '前日餘額', 'PreviousBalance', 'MarginPurchaseBalancePreviousDay']);
    const current = pick(row, ['融資今日餘額', '今日餘額', 'CurrentBalance', 'MarginBalance', 'MarginPurchaseBalance']);
    return { marginBalance:current, marginBalanceChangeDaily:previous !== null && current !== null ? current - previous : pick(row, ['融資增減', 'MarginChange']), source:SOURCE_STATUS.LIVE };
  }));
}

export function parseInstitutions(rows = []) {
  return Object.fromEntries(entries(rows, row => ({
    foreignNetDaily:pick(row, ['外資及陸資(不含外資自營商)-買賣超股數', '外資及陸資買賣超股數', '外資及陸資合計買賣超', 'Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference', 'ForeignInvestorsInclude MainlandAreaInvestors-Difference', 'ForeignNet']),
    trustNetDaily:pick(row, ['投信買賣超股數', '投信買賣超', 'SecuritiesInvestmentTrustCompanies-Difference', 'InvestmentTrustNet']),
    dealerNetDaily:pick(row, ['自營商買賣超股數', '自營商買賣超', 'Dealers-Difference', 'DealerNet']),
    source:SOURCE_STATUS.LIVE
  })));
}

export function mergeFactors(...maps) {
  const codes = new Set(maps.flatMap(map => Object.keys(map)));
  return Object.fromEntries([...codes].map(code => [code, Object.assign({ code }, ...maps.map(map => map[code] ?? {}))]));
}

export function factorEndpoints() { return { ...ENDPOINTS }; }
