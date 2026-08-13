const finite = value => Number.isFinite(Number(value)) ? Number(value) : undefined;

export function enrichStock(stock, factors = {}) {
  const revenue = factors.revenue ?? {};
  const income = factors.income ?? {};
  const valuation = factors.valuation ?? {};
  const chips = factors.chips ?? {};
  return {
    ...stock,
    revenueGrowth4q: finite(revenue.revenueYoY) ?? stock.revenueGrowth4q,
    eps4q: finite(income.eps) ?? stock.eps4q,
    grossMargin: finite(income.grossMargin) ?? stock.grossMargin,
    operatingMargin: finite(income.operatingMargin) ?? stock.operatingMargin,
    pe: finite(valuation.pe) ?? stock.pe,
    pb: finite(valuation.pb) ?? stock.pb,
    foreign20: finite(chips.foreignNet) ?? stock.foreign20,
    investmentTrust20: finite(chips.trustNet) ?? stock.investmentTrust20,
    dealer20: finite(chips.dealerNet) ?? stock.dealer20,
    margin20: finite(chips.marginChange) ?? stock.margin20,
    short20: finite(chips.shortChange) ?? stock.short20,
    factorSource: [revenue, income, valuation, chips].some(x => x.source === 'live') ? 'live' : stock.factorSource ?? 'demo'
  };
}

export function enrichBatch(stocks, factorMap = {}) {
  return stocks.map(stock => enrichStock(stock, factorMap[stock.code] ?? {}));
}
