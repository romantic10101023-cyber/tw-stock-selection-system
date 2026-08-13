import { sma } from './technical.mjs';

export function classifyMarket({ indexCloses = [], breadth = {} } = {}) {
  if (indexCloses.length < 60) return { mode: 'range', confidence: 0, reason: '市場指數資料不足' };
  const close = indexCloses.at(-1);
  const ma20 = sma(indexCloses, 20);
  const ma60 = sma(indexCloses, 60);
  const adv = Number(breadth.advancers ?? 0);
  const dec = Number(breadth.decliners ?? 0);
  const breadthRatio = adv + dec ? adv / (adv + dec) : 0.5;
  if (close > ma20 && ma20 > ma60 && breadthRatio >= 0.52) return { mode: 'bull', confidence: Math.round(Math.min(1, (breadthRatio - .5) * 4) * 100), reason: '指數在均線上且市場廣度偏強' };
  if (close < ma20 && ma20 < ma60 && breadthRatio <= 0.42) return { mode: 'bear', confidence: Math.round(Math.min(1, (.5 - breadthRatio) * 4) * 100), reason: '指數跌破均線且市場廣度偏弱' };
  return { mode: 'range', confidence: 50, reason: '趨勢與市場廣度未形成一致方向' };
}
