const reasonFor = stock => {
  if (stock.isEtf || stock.isFund || stock.isEtn || stock.isReit) return 'ETF／基金／ETN／REIT／受益證券';
  if (stock.isWarrant) return '權證';
  if (stock.isDepositaryReceipt) return '存託憑證';
  if (stock.isPreferredShare) return '特別股';
  if (stock.isFinancial) return '官方產業分類：金融業';
  if (stock.isConstruction) return '官方產業分類：建材營造業';
  if (!stock.isCommonStock || stock.securityType !== 'common_stock') return `非普通股證券：${stock.securityType ?? 'unknown'}`;
  return null;
};

export function filterUniverse(stocks) {
  const included = [], excluded = [];
  for (const raw of stocks) {
    const stock = {
      ...raw,
      securityType:raw.securityType ?? 'unknown', industry:raw.industry ?? null,
      isCommonStock:raw.isCommonStock === true, isEtf:raw.isEtf === true,
      isFund:raw.isFund === true, isEtn:raw.isEtn === true, isReit:raw.isReit === true,
      isWarrant:raw.isWarrant === true, isDepositaryReceipt:raw.isDepositaryReceipt === true, isPreferredShare:raw.isPreferredShare === true,
      isFinancial:raw.isFinancial === true, isConstruction:raw.isConstruction === true
    };
    const exclusionReason = reasonFor(stock);
    if (exclusionReason) excluded.push({ ...stock, exclusionReason });
    else included.push({ ...stock, exclusionReason:null });
  }
  const exclusionReasons = Object.fromEntries([...new Set(excluded.map(stock => stock.exclusionReason))].map(reason => [reason, excluded.filter(stock => stock.exclusionReason === reason).length]));
  const counts = {
    input:stocks.length, included:included.length, excluded:excluded.length,
    rawUniverseCount:stocks.length, includedCommonStockCount:included.length,
    excludedEtfFundCount:excluded.filter(stock => stock.isEtf || stock.isFund || stock.isEtn || stock.isReit).length,
    excludedFinancialCount:excluded.filter(stock => stock.isFinancial).length,
    excludedConstructionCount:excluded.filter(stock => stock.isConstruction).length,
    excludedOtherSecurityCount:excluded.filter(stock => !stock.isEtf && !stock.isFinancial && !stock.isConstruction).length,
    exclusionReasons
  };
  return { included, excluded, counts };
}
