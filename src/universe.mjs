const EXCLUDED = ['ETF', 'ETN', '權證', 'TDR', 'KY', '金融', '營建'];

export function filterUniverse(stocks, { minPrice = 30, minVolume5 = 1000 } = {}) {
  const included = [], excluded = [];
  for (const stock of stocks) {
    const excludedTag = EXCLUDED.find(tag => stock.tags?.includes(tag));
    const reason = excludedTag ? `排除類別：${excludedTag}` :
      Number(stock.price) < minPrice ? `股價低於${minPrice}元` :
      Number(stock.volume5) < minVolume5 ? `5日均量低於${minVolume5}張` :
      (!stock.code || !stock.name ? '缺少股票識別資料' : null);
    if (reason) excluded.push({ ...stock, exclusionReason: reason });
    else included.push(stock);
  }
  return { included, excluded, counts: { input: stocks.length, included: included.length, excluded: excluded.length } };
}
