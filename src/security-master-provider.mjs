import { fetchOfficialJson } from './live-provider.mjs';

export const SECURITY_MASTER_URLS = {
  twse:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
  tpex:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O'
};

const code = row => String(row['公司代號'] ?? row.SecuritiesCompanyCode ?? '').trim();
const INDUSTRIES = { '01':'水泥工業','02':'食品工業','03':'塑膠工業','04':'紡織纖維','05':'電機機械','06':'電器電纜','08':'玻璃陶瓷','09':'造紙工業','10':'鋼鐵工業','11':'橡膠工業','12':'汽車工業','14':'建材營造','15':'航運業','16':'觀光餐旅','17':'金融保險','18':'貿易百貨','20':'其他','21':'化學工業','22':'生技醫療','23':'油電燃氣','24':'半導體業','25':'電腦及週邊設備業','26':'光電業','27':'通信網路業','28':'電子零組件業','29':'電子通路業','30':'資訊服務業','31':'其他電子業','32':'數位雲端','33':'居家生活','34':'綠能環保','35':'運動休閒' };
const number = value => {
  const parsed = Number(String(value ?? '').replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

export function parseSecurityMaster(rows = [], market) {
  return Object.fromEntries(rows.map(row => {
    const stockCode = code(row);
    const industryCode = String(row['產業別'] ?? row.SecuritiesIndustryCode ?? '').trim().padStart(2, '0');
    return [stockCode, {
      code:stockCode,
      market,
      securityType:'common_stock',
      industryCode,
      industry:INDUSTRIES[industryCode] ?? `官方產業代碼 ${industryCode}`,
      isCommonStock:true,
      isEtf:false,
      isFinancial:industryCode === '17',
      isConstruction:industryCode === '14',
      preferredShares:number(row['特別股'] ?? row['PreferredStock.shares']),
      classificationSource:SECURITY_MASTER_URLS[market]
    }];
  }).filter(([stockCode]) => /^\d{4}$/.test(stockCode)));
}

export async function loadOfficialSecurityMaster() {
  const twse = await fetchOfficialJson(SECURITY_MASTER_URLS.twse);
  const tpex = await fetchOfficialJson(SECURITY_MASTER_URLS.tpex);
  return { ...parseSecurityMaster(Array.isArray(twse) ? twse : [], 'twse'), ...parseSecurityMaster(Array.isArray(tpex) ? tpex : [], 'tpex') };
}

export function classifyQuotes(stocks, master) {
  return stocks.map(stock => {
    const metadata = master[stock.code];
    if (metadata?.market === stock.market) return { ...stock, ...metadata };
    if (stock.classificationSource && stock.securityType) return stock;
    const isEtf = /^00/.test(stock.code) || /ETF|指數股票型基金|受益證券/i.test(stock.name ?? '');
    return { ...stock, securityType:isEtf ? 'etf_or_fund' : 'other_security', industry:null, industryCode:null, isCommonStock:false, isEtf, isFinancial:false, isConstruction:false, classificationSource:'official company master: no matching common-stock issuer' };
  });
}
