import { fetchOfficialBuffer, fetchOfficialJson } from './live-provider.mjs';

export const SECURITY_MASTER_URLS = {
  twse:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L', tpex:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O',
  twseProducts:'https://isin.twse.com.tw/isin/C_public.jsp?strMode=2', tpexProducts:'https://isin.twse.com.tw/isin/C_public.jsp?strMode=4'
};
const INDUSTRIES = { '01':'水泥工業','02':'食品工業','03':'塑膠工業','04':'紡織纖維','05':'電機機械','06':'電器電纜','08':'玻璃陶瓷','09':'造紙工業','10':'鋼鐵工業','11':'橡膠工業','12':'汽車工業','14':'建材營造','15':'航運業','16':'觀光餐旅','17':'金融保險','18':'貿易百貨','20':'其他','21':'化學工業','22':'生技醫療','23':'油電燃氣','24':'半導體業','25':'電腦及週邊設備業','26':'光電業','27':'通信網路業','28':'電子零組件業','29':'電子通路業','30':'資訊服務業','31':'其他電子業','32':'數位雲端','33':'居家生活','34':'綠能環保','35':'運動休閒' };
export const normalizeSecurityCode = value => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
const plain = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').trim();

export function parseSecurityMaster(rows = [], market) {
  return Object.fromEntries(rows.map(row => {
    const code = normalizeSecurityCode(row['公司代號'] ?? row.SecuritiesCompanyCode);
    const industryCode = String(row['產業別'] ?? row.SecuritiesIndustryCode ?? '').trim().padStart(2, '0');
    return [code, { code, market, securityType:'common_stock', industryCode, industry:INDUSTRIES[industryCode] ?? `官方產業代碼 ${industryCode}`, isCommonStock:true, isEtf:false, isFund:false, isEtn:false, isReit:false, isWarrant:false, isDepositaryReceipt:false, isPreferredShare:false, isFinancial:industryCode === '17', isConstruction:industryCode === '14', classificationSource:SECURITY_MASTER_URLS[market] }];
  }).filter(([code]) => /^\d{4}$/.test(code)));
}

function flagsFor(section, name, code) {
  const text = `${section} ${name}`;
  const isEtn = /ETN|指數投資證券/i.test(text), isReit = /REIT|不動產投資信託|R\d$/i.test(text);
  const isWarrant = /權證|認購|認售/i.test(section), isDepositaryReceipt = /存託憑證|DR$/i.test(text);
  const isPreferredShare = /特別股/i.test(text), isFund = /基金|受益證券|ETF|指數股票型/i.test(text) && !isEtn;
  const isEtf = /ETF|指數股票型基金|槓桿|反向|主動式ETF/i.test(text) || (isFund && /^00/.test(code));
  const securityType = isEtn ? 'etn' : isReit ? 'reit' : isWarrant ? 'warrant' : isDepositaryReceipt ? 'depositary_receipt' : isPreferredShare ? 'preferred_share' : isEtf ? 'etf' : isFund ? 'fund_or_beneficial_security' : /股票/.test(section) ? 'common_stock' : 'other_security';
  return { securityType, isCommonStock:securityType === 'common_stock', isEtf, isFund, isEtn, isReit, isWarrant, isDepositaryReceipt, isPreferredShare };
}

export function parseOfficialProductHtml(html, market, source) {
  const products = {}, rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  let section = '';
  for (const row of rows) {
    if (/colspan/i.test(row)) { section = plain(row); continue; }
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => plain(match[1]));
    const match = cells[0]?.match(/^([0-9A-Z-]{4,12})\s+(.+)$/i);
    if (!match) continue;
    const code = normalizeSecurityCode(match[1]), name = match[2].trim();
    products[code] = { code, name, market, ...flagsFor(section, name, code), industry:cells[4] || null, classificationSource:source, officialSection:section };
  }
  return products;
}

export async function loadOfficialSecurityMaster() {
  const twseRows = await fetchOfficialJson(SECURITY_MASTER_URLS.twse), tpexRows = await fetchOfficialJson(SECURITY_MASTER_URLS.tpex);
  const twseHtml = new TextDecoder('big5').decode(await fetchOfficialBuffer(SECURITY_MASTER_URLS.twseProducts, { timeoutMs:30000 }));
  const tpexHtml = new TextDecoder('big5').decode(await fetchOfficialBuffer(SECURITY_MASTER_URLS.tpexProducts, { timeoutMs:30000 }));
  const companies = { ...parseSecurityMaster(twseRows, 'twse'), ...parseSecurityMaster(tpexRows, 'tpex') };
  const products = { ...parseOfficialProductHtml(twseHtml, 'twse', SECURITY_MASTER_URLS.twseProducts), ...parseOfficialProductHtml(tpexHtml, 'tpex', SECURITY_MASTER_URLS.tpexProducts) };
  return { companies, products, officialEtfSymbols:Object.values(products).filter(item => item.isEtf || item.isFund).map(item => item.code) };
}

export function classifyQuotes(stocks, master) {
  const companies = master.companies ?? master, products = master.products ?? {};
  return stocks.map(stock => {
    const code = normalizeSecurityCode(stock.code), product = products[code], company = companies[code];
    if (product && !product.isCommonStock) return { ...stock, ...product, code };
    if (company?.market === stock.market) return { ...stock, ...product, ...company, code };
    return { ...stock, ...product, code, securityType:product?.securityType ?? 'other_security', industry:product?.industry ?? null, isCommonStock:false, isEtf:product?.isEtf ?? false, isFund:product?.isFund ?? false, isEtn:product?.isEtn ?? false, isReit:product?.isReit ?? false, isWarrant:product?.isWarrant ?? false, isDepositaryReceipt:product?.isDepositaryReceipt ?? false, isPreferredShare:product?.isPreferredShare ?? false, isFinancial:false, isConstruction:false, classificationSource:product?.classificationSource ?? 'official security masters: no matching common-stock issuer' };
  });
}
