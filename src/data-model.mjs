export const SOURCE_STATUS = { LIVE: 'live', CACHED: 'cached', DEMO: 'demo', MISSING: 'missing' };

export function normalizeStock(raw = {}) {
  return {
    code: String(raw.code ?? '').padStart(4, '0'),
    name: raw.name ?? '未命名',
    sector: raw.sector ?? '未分類',
    market: raw.market ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    securityType:raw.securityType ?? null,
    industry:raw.industry ?? null,
    industryCode:raw.industryCode ?? null,
    isCommonStock:raw.isCommonStock === true,
    isEtf:raw.isEtf === true,
    isFinancial:raw.isFinancial === true,
    isConstruction:raw.isConstruction === true,
    exclusionReason:raw.exclusionReason ?? null,
    classificationSource:raw.classificationSource ?? null,
    price: Number(raw.price),
    fairValue: Number(raw.fairValue ?? 0),
    pe: Number(raw.pe),
    forwardPe: Number(raw.forwardPe),
    eps4q: Number(raw.eps4q),
    capital: Number(raw.capital),
    revenueGrowth4q: Number(raw.revenueGrowth4q),
    cumulativeRevenueGrowth: Number(raw.cumulativeRevenueGrowth),
    grossMargin: Number(raw.grossMargin),
    roe: Number(raw.roe),
    volume5: Number(raw.volume5),
    foreign20: Number(raw.foreign20),
    foreign5: Number(raw.foreign5),
    investmentTrust20: Number(raw.investmentTrust20),
    investmentTrust5: Number(raw.investmentTrust5),
    margin20: Number(raw.margin20),
    margin5: Number(raw.margin5),
    shortRatio: Number(raw.shortRatio),
    support: Number(raw.support),
    stop: Number(raw.stop),
    tp1: Number(raw.tp1),
    technical: raw.technical ?? {},
    dataDate: raw.dataDate ?? null,
    asOf: raw.asOf ?? null,
    dataAgeDays: Number(raw.dataAgeDays ?? 0),
    source: raw.source ?? SOURCE_STATUS.MISSING,
    sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : []
  };
}

export function validateBatch(stocks, asOf) {
  const errors = [];
  const seen = new Set();
  for (const stock of stocks) {
    if (!/^\d{4}$/.test(stock.code)) errors.push(`${stock.code || '空代號'}：代號格式錯誤`);
    if (seen.has(stock.code)) errors.push(`${stock.code}：重複股票`);
    seen.add(stock.code);
    if (stock.dataDate && asOf && stock.dataDate > asOf) errors.push(`${stock.code}：資料日期晚於市場日期`);
    if (stock.source === SOURCE_STATUS.MISSING) errors.push(`${stock.code}：缺少資料來源標記`);
  }
  return { ok: errors.length === 0, errors, count: stocks.length, unique: seen.size };
}
