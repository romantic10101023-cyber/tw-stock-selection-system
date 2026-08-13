export function buildTradePlan({ price, stop, tp1, capital = 40000, lotSize = 1 }) {
  const entry = Number(price);
  const stopPrice = Number(stop);
  const target = Number(tp1);
  if (![entry, stopPrice, target, capital].every(Number.isFinite) || entry <= 0 || stopPrice >= entry) return { valid:false, reason:'價格或停損資料無效' };
  const shares = Math.max(0, Math.floor(capital / entry / lotSize) * lotSize);
  const invested = shares * entry;
  const maxLoss = shares * (entry - stopPrice);
  const targetProfit = shares * Math.max(target - entry, 0);
  return { valid: shares > 0, shares, entry, stop: stopPrice, tp1: target, invested, capital, maxLoss, targetProfit, riskPct: (entry - stopPrice) / entry, rewardRisk: maxLoss ? targetProfit / maxLoss : 0 };
}
