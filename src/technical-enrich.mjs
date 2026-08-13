import { deriveTechnical, deriveWeeklyTechnical, MIN_DAILY_BARS, MIN_WEEKLY_BARS } from './technical.mjs';

export function applyTechnical(stock, bars = [], { source = 'missing' } = {}) {
  const daily = deriveTechnical(bars);
  const weekly = deriveWeeklyTechnical(bars);
  const dailyBars = bars.length;
  const weeklyBars = weekly.bars?.length ?? 0;
  const reasons = [];
  if (dailyBars < MIN_DAILY_BARS) reasons.push(`日線不足：${dailyBars}/${MIN_DAILY_BARS}`);
  if (weeklyBars < MIN_WEEKLY_BARS) reasons.push(`週線不足：${weeklyBars}/${MIN_WEEKLY_BARS}`);
  const complete = daily.complete && weekly.complete;
  return {
    ...stock,
    dailyBars,
    weeklyBars,
    historyStatus:complete ? 'complete' : 'insufficient',
    historyReasons:reasons,
    technical:complete ? daily : { complete:false, reason:reasons.join('；') },
    weeklyTechnical:weekly,
    support:complete ? daily.support : stock.support,
    stop:complete ? daily.stop : stock.stop,
    technicalSource:complete ? source : 'missing'
  };
}

export function applyTechnicalBatch(stocks, historiesByCode = {}) {
  return stocks.map(stock => {
    const history = historiesByCode[stock.code];
    return applyTechnical(stock, history?.bars ?? [], { source:history?.source ?? 'missing' });
  });
}
