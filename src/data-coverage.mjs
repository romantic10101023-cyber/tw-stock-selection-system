import { MIN_DAILY_BARS, MIN_WEEKLY_BARS } from './technical.mjs';

const finiteFields = (stock, fields) => fields.every(field => stock[field] !== null && stock[field] !== undefined && Number.isFinite(Number(stock[field])));
export const BASIC_FIELDS = ['price', 'reportedEps', 'revenueYoY', 'volume5'];

export function scoringEligibility(stock) {
  const reasons = [];
  const dailyBars = Number(stock.dailyBars ?? 0), weeklyBars = Number(stock.weeklyBars ?? 0);
  const missingBasicFields = BASIC_FIELDS.filter(field => !finiteFields(stock, [field]));
  if (dailyBars < MIN_DAILY_BARS) reasons.push(`日線不足 ${dailyBars}/${MIN_DAILY_BARS}`);
  if (weeklyBars < MIN_WEEKLY_BARS) reasons.push(`週線不足 ${weeklyBars}/${MIN_WEEKLY_BARS}`);
  if (missingBasicFields.length) reasons.push(`官方基本資料不足 ${missingBasicFields.join(', ')}`);
  if (!stock.technical?.complete || !stock.weeklyTechnical?.complete) reasons.push('技術資料不完整');
  return { eligible:reasons.length === 0, reasons, dailyBars, weeklyBars, missingBasicFields };
}

export function partitionByCoverage(stocks = []) {
  const eligible = [], insufficient = [];
  for (const stock of stocks) {
    const row = { ...stock, eligibility:scoringEligibility(stock) };
    (row.eligibility.eligible ? eligible : insufficient).push(row);
  }
  return { eligible, insufficient };
}

export function missingFundamentalFields(stocks = []) {
  return Object.fromEntries(BASIC_FIELDS.filter(field => !['price','volume5'].includes(field)).map(field => [field, stocks.filter(stock => !finiteFields(stock, [field])).length]));
}

export function coverageReport(stocks = []) {
  const details = stocks.map(stock => {
    const eligibility = scoringEligibility(stock);
    return { code:stock.code, name:stock.name, market:stock.market, dailyBars:eligibility.dailyBars, weeklyBars:eligibility.weeklyBars, basicDataComplete:eligibility.missingBasicFields.length === 0, missingBasicFields:eligibility.missingBasicFields, factorAvailability:stock.factorAvailability ?? {}, eligible:eligibility.eligible, reasons:eligibility.reasons };
  });
  const total = details.length, count = predicate => details.filter(predicate).length;
  const report = {
    total,
    price:stocks.filter(stock => finiteFields(stock, ['price'])).length,
    fundamentals:stocks.filter(stock => finiteFields(stock, ['reportedEps','revenueYoY'])).length,
    valuation:stocks.filter(stock => finiteFields(stock, ['pe','fairValue']) || Number(stock.reportedEps) > 0).length,
    chips:stocks.filter(stock => finiteFields(stock, ['foreignNetDaily','marginBalanceChangeDaily'])).length,
    dailyBars:count(row => row.dailyBars >= MIN_DAILY_BARS), weeklyBars:count(row => row.weeklyBars >= MIN_WEEKLY_BARS),
    eligible:count(row => row.eligible), insufficient:count(row => !row.eligible),
    missingFundamentalFields:missingFundamentalFields(stocks), details
  };
  report.percent = Object.fromEntries(['price','fundamentals','valuation','chips','dailyBars','weeklyBars','eligible'].map(key => [key, total ? Math.round(report[key] / total * 1000) / 10 : 0]));
  report.ok = total > 0 && report.eligible > 0;
  return report;
}
