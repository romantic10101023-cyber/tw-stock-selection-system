function complete(stock, fields) {
  return fields.every(field => {
    const value = stock[field];
    return value !== null && value !== undefined && Number.isFinite(Number(value));
  });
}

export function coverageReport(stocks = []) {
  const total = stocks.length;
  const count = predicate => stocks.filter(predicate).length;
  const report = {
    total,
    price: count(stock => complete(stock, ['price'])),
    fundamentals: count(stock => complete(stock, ['eps4q', 'revenueGrowth4q'])),
    valuation: count(stock => complete(stock, ['pe', 'fairValue']) || Number(stock.eps4q) > 0),
    chips: count(stock => complete(stock, ['foreign20', 'margin20'])),
    dailyBars: count(stock => stock.technicalSource === 'live' || stock.technical?.complete === true),
    weeklyBars: count(stock => stock.weeklyTechnical?.complete === true)
  };
  report.percent = Object.fromEntries(Object.entries(report).filter(([key]) => key !== 'total').map(([key, value]) => [key, total ? Math.round(value / total * 1000) / 10 : 0]));
  report.ok = total > 0 && report.dailyBars === total && report.weeklyBars === total;
  return report;
}
