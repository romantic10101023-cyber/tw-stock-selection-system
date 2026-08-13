import { deriveTechnical, deriveWeeklyTechnical } from './technical.mjs';

export function applyTechnical(stock, bars = []) {
  const daily = deriveTechnical(bars);
  const weekly = deriveWeeklyTechnical(bars);
  if (!daily.complete || !weekly.complete) return { ...stock, technical: { complete:false, reason: daily.reason ?? weekly.reason }, weeklyTechnical: weekly, technicalSource:'missing' };
  return {
    ...stock,
    technical: daily,
    weeklyTechnical: weekly,
    support: daily.support,
    stop: daily.stop,
    technicalSource: 'live'
  };
}

export function applyTechnicalBatch(stocks, barsByCode = {}) {
  return stocks.map(stock => applyTechnical(stock, barsByCode[stock.code] ?? []));
}
