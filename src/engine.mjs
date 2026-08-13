export const CONFIG = {
  weights: { valuation: 25, fundamentals: 20, chips: 25, technical: 30 },
  hard: { minPrice: 30, minVolume5: 1000 },
  thresholds: { top12: 60, top3: 72, minRR: 1.5 }
};

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const safe = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;

export function dataQuality(stock) {
  const errors = [];
  const required = ['price', 'eps4q', 'revenueGrowth4q', 'volume5', 'foreign20', 'technical'];
  for (const field of required) {
    if (stock[field] === undefined || stock[field] === null) errors.push(`缺少${field}`);
    else if (typeof stock[field] === 'number' && !Number.isFinite(stock[field])) errors.push(`${field}不是有效數字`);
  }
  if (!stock.technical || Object.keys(stock.technical).length === 0) errors.push('缺少技術結構');
  if (stock.dataDate && stock.asOf && stock.dataDate > stock.asOf) errors.push('資料日期晚於市場日期');
  if (stock.dataAgeDays > 120) errors.push('財報或估值資料過期');
  if (stock.technicalSource === 'missing' || stock.technical?.complete === false) errors.push('技術K線資料不足');
  return { ok: errors.length === 0, errors };
}

export function tradability(stock) {
  const excluded = ['ETF', 'ETN', '權證', 'TDR', 'KY', '金融', '營建'];
  const reason = excluded.find(x => stock.tags?.includes(x));
  if (reason) return { ok: false, reason: `排除類別：${reason}` };
  if (safe(stock.price) < CONFIG.hard.minPrice) return { ok: false, reason: '股價低於30元' };
  if (safe(stock.volume5) < CONFIG.hard.minVolume5) return { ok: false, reason: '5日均量不足1000張' };
  return { ok: true, reason: '' };
}

export function scoreValuation(stock) {
  const pe = safe(stock.pe, null);
  const forwardPe = safe(stock.forwardPe, null);
  const fair = safe(stock.fairValue, 0) || safe(stock.eps4q, 0) * safe(stock.normalPe, safe(stock.sectorPe, 15));
  const price = safe(stock.price);
  const discount = fair ? (fair - price) / fair : 0;
  let score = 0, label = '資料不足';
  if (stock.valuationTrap) { score = 0; label = '估值陷阱'; }
  else if (discount >= 0.32) { score = 25; label = '超便宜'; }
  else if (discount >= 0.20) { score = 20; label = '便宜'; }
  else if (discount >= -0.05) { score = 12; label = '合理'; }
  else if (discount >= -0.25) { score = 4; label = '偏貴'; }
  return { score, label, pe, forwardPe, fairValue: fair, discount };
}

export function scoreFundamentals(stock) {
  let score = 0;
  if (safe(stock.capital) > 5) score += 5;
  if (safe(stock.revenueGrowth4q) >= 10) score += 5;
  if (safe(stock.eps4q) >= 1) score += 5;
  if (safe(stock.cumulativeRevenueGrowth) >= 20) score += 5;
  if (safe(stock.grossMargin) >= 20) score += 2;
  if (safe(stock.roe) >= 15) score += 2;
  return clamp(score / 24 * 100);
}

export function scoreChips(stock) {
  let score = 50;
  if (safe(stock.foreign20) > 0) score += 15;
  if (safe(stock.investmentTrust20) > 0) score += 15;
  if (safe(stock.margin20) < 0) score += 10;
  if (safe(stock.shortRatio) > 10) score += 5;
  if (safe(stock.foreign5) < 0 && safe(stock.investmentTrust5) < 0) score -= 25;
  if (safe(stock.margin5) > 8) score -= 15;
  return clamp(score);
}

export function scoreTechnical(stock) {
  const t = stock.technical || {};
  let score = 0;
  if (t.aboveSeasonal) score += 20;
  if (t.weekTrendUp) score += 20;
  if (t.nearSupport) score += 25;
  if (t.volumeContracting) score += 10;
  if (t.reclaim20ma) score += 15;
  if (t.breakdown) score -= 40;
  if (t.overextended) score -= 20;
  return clamp(score);
}

export function analyze(stock, marketMode = 'range') {
  const quality = dataQuality(stock);
  const trade = tradability(stock);
  const valuation = scoreValuation(stock);
  const fundamentals = scoreFundamentals(stock);
  const chips = scoreChips(stock);
  const technical = scoreTechnical(stock);
  const support = safe(stock.support);
  const stop = safe(stock.stop, support * 0.93);
  const tp1 = safe(stock.tp1, valuation.fairValue * 0.9);
  const risk = Math.max(stock.price - stop, 0.01);
  const rr = Math.max((tp1 - stock.price) / risk, 0);
  let total = valuation.score + fundamentals * .20 + chips * .25 + technical * .30;
  if (marketMode === 'bear') total += valuation.label === '便宜' || valuation.label === '超便宜' ? 4 : -4;
  if (!quality.ok || !trade.ok || valuation.label === '估值陷阱') total = Math.min(total, 59);
  const status = !quality.ok ? '資料不足' : !trade.ok ? '排除' : rr < CONFIG.thresholds.minRR ? '等待更佳風報比' : total >= CONFIG.thresholds.top3 ? '可布局' : total >= CONFIG.thresholds.top12 ? '觀察' : '等待回檔';
  return { ...stock, quality, trade, valuation, fundamentals, chips, technical, support, stop, tp1, rr, total: Math.round(total * 10) / 10, status };
}

export function rankStocks(stocks, marketMode = 'range') {
  return stocks.map(s => analyze(s, marketMode)).sort((a, b) => b.total - a.total);
}

export function buildLists(stocks, marketMode = 'range') {
  const ranked = rankStocks(stocks, marketMode);
  return { ranked, top12: ranked.filter(x => x.total >= 60 && x.status !== '排除' && x.status !== '資料不足').slice(0, 12), top3: ranked.filter(x => x.total >= 72 && x.status === '可布局' && x.rr >= 1.5).slice(0, 3), watch: ranked.filter(x => ['觀察', '等待回檔', '等待更佳風報比'].includes(x.status)).slice(0, 8) };
}
