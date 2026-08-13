export function evaluateTrade({ entry, stop, tp1, highs = [], lows = [] }) {
  const firstStop = lows.findIndex(price => Number(price) <= Number(stop));
  const firstTarget = highs.findIndex(price => Number(price) >= Number(tp1));
  if (firstStop === -1 && firstTarget === -1) return { status: 'open', days: Math.max(highs.length, lows.length), exitPrice: null };
  if (firstStop !== -1 && (firstTarget === -1 || firstStop <= firstTarget)) return { status: 'stop', days: firstStop + 1, exitPrice: Number(stop) };
  return { status: 'tp1', days: firstTarget + 1, exitPrice: Number(tp1) };
}

import { buildTradePlan } from './risk.mjs';

export function snapshotRecommendations(scan) {
  return scan.top3.map((stock, index) => ({
    rank: index + 1,
    code: stock.code,
    name: stock.name,
    score: stock.total,
    status: stock.status,
    valuation: stock.valuation.label,
    entry: stock.price,
    support: stock.support,
    stop: stock.stop,
    tp1: stock.tp1,
    rr: stock.rr,
    tradePlan: buildTradePlan({ price:stock.price, stop:stock.stop, tp1:stock.tp1, capital:40000 }),
    modelVersion: 'v1.2',
    asOf: scan.asOf
  }));
}

export function summarizeOutcomes(rows = []) {
  const total = rows.length;
  const closed = rows.filter(row => ['tp1', 'stop'].includes(row.status));
  const wins = rows.filter(row => row.status === 'tp1');
  const stops = rows.filter(row => row.status === 'stop');
  const returns = closed.map(row => Number(row.returnPct)).filter(Number.isFinite);
  const days = rows.map(row => Number(row.days)).filter(Number.isFinite);
  return {
    total,
    closed: closed.length,
    open: rows.filter(row => row.status === 'open').length,
    wins: wins.length,
    stops: stops.length,
    hitRate: closed.length ? wins.length / closed.length : null,
    stopRate: closed.length ? stops.length / closed.length : null,
    averageReturnPct: returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
    averageDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null
  };
}
