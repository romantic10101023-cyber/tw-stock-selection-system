const finite = value => Number.isFinite(Number(value)) ? Number(value) : undefined;
const availability = (value, source, reason) => value === undefined ? { available:false, source, reason } : { available:true, source };

export function enrichStock(stock, factors = {}) {
  const revenue = factors.revenue ?? {}, income = factors.income ?? {}, valuation = factors.valuation ?? {}, chips = factors.chips ?? {};
  const reportedEps = finite(income.reportedEps);
  const revenueYoY = finite(revenue.revenueYoY);
  const foreignNetDaily = finite(chips.foreignNetDaily);
  const marginBalanceChangeDaily = finite(chips.marginBalanceChangeDaily);
  return {
    ...stock,
    reportedEps, revenueYoY,
    cumulativeRevenueGrowth:finite(revenue.cumulativeRevenueYoY),
    grossMargin:finite(income.grossMargin) ?? stock.grossMargin,
    pe:finite(valuation.pe) ?? stock.pe, pb:finite(valuation.pb) ?? stock.pb,
    foreignNetDaily, trustNetDaily:finite(chips.trustNetDaily), dealerNetDaily:finite(chips.dealerNetDaily), marginBalanceChangeDaily,
    factorAvailability:{
      reportedEps:availability(reportedEps, 'official income statement', 'No matching row/value in the latest official income-statement dataset'),
      revenueYoY:availability(revenueYoY, 'official monthly revenue', 'No matching row/value in the latest official monthly-revenue dataset'),
      foreign20:{ available:false, source:'official institutional daily data', reason:'20-session aggregate is not supplied by the current official batch source; daily value is retained separately' },
      margin20:{ available:false, source:'official margin daily data', reason:'20-session aggregate is not supplied by the current official batch source; daily balance change is retained separately' }
    },
    factorSource:[revenue, income, valuation, chips].some(value => value.source === 'live') ? 'live' : 'missing'
  };
}

export function enrichBatch(stocks, factorMap = {}) { return stocks.map(stock => enrichStock(stock, factorMap[stock.code] ?? {})); }
