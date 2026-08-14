import { fetchOfficialJson, fetchOfficialText } from './live-provider.mjs';
import { parseOfficialCsv } from './official-csv.mjs';
export { parseOfficialCsv } from './official-csv.mjs';

export const SECURITY_MASTER_URLS = {
  twse:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L', tpex:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O',
  twseCompanyFallback:'https://mopsfin.twse.com.tw/opendata/t187ap03_L.csv', tpexCompanyFallback:'https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv',
  twseProducts:'https://openapi.twse.com.tw/v1/opendata/t187ap47_L', twseProductsFallback:'https://mopsfin.twse.com.tw/opendata/t187ap47_L.csv',
  tpexProducts:'https://www.tpex.org.tw/openapi/v1/tpex_securities', tpexProductsFallback:'https://mopsfin.twse.com.tw/opendata/t187ap47_O.csv'
};
const INDUSTRIES = { '01':'水泥工業','02':'食品工業','03':'塑膠工業','04':'紡織纖維','05':'電機機械','06':'電器電纜','08':'玻璃陶瓷','09':'造紙工業','10':'鋼鐵工業','11':'橡膠工業','12':'汽車工業','14':'建材營造','15':'航運業','16':'觀光餐旅','17':'金融保險','18':'貿易百貨','20':'其他','21':'化學工業','22':'生技醫療','23':'油電燃氣','24':'半導體業','25':'電腦及週邊設備業','26':'光電業','27':'通信網路業','28':'電子零組件業','29':'電子通路業','30':'資訊服務業','31':'其他電子業','32':'數位雲端','33':'居家生活','34':'綠能環保','35':'運動休閒' };
export const normalizeSecurityCode = value => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
const plain = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').trim();
const pick = (row, ...keys) => { for (const key of keys) if (row?.[key] !== undefined) return row[key]; return undefined; };

export function parseSecurityMaster(rows = [], market, source=SECURITY_MASTER_URLS[market]) {
  return Object.fromEntries(rows.map(row => {
    const code = normalizeSecurityCode(pick(row,'公司代號','SecuritiesCompanyCode','Code'));
    const industryCode = String(pick(row,'產業別','SecuritiesIndustryCode','IndustryCode') ?? '').trim().padStart(2, '0');
    return [code, { code, market, securityType:'common_stock', industryCode, industry:INDUSTRIES[industryCode] ?? `官方產業代碼 ${industryCode}`, isCommonStock:true, isEtf:false, isFund:false, isEtn:false, isReit:false, isWarrant:false, isDepositaryReceipt:false, isPreferredShare:false, isFinancial:industryCode === '17', isConstruction:industryCode === '14', classificationSource:source }];
  }).filter(([code]) => /^\d{4}$/.test(code)));
}

export function parseFundMaster(rows=[],market,source){return Object.fromEntries(rows.map(row=>{const code=normalizeSecurityCode(pick(row,'基金代號','FundCode','SecuritiesCompanyCode','證券代號')),name=String(pick(row,'基金簡稱','FundAbbreviation','CompanyName','證券名稱')??'').trim(),fundType=String(pick(row,'基金類型','FundType')??'').trim();return[code,{code,name,market,securityType:'etf',industry:null,isCommonStock:false,isEtf:true,isFund:true,isEtn:false,isReit:false,isWarrant:false,isDepositaryReceipt:false,isPreferredShare:false,isFinancial:false,isConstruction:false,classificationSource:source,officialFundType:fundType}];}).filter(([code])=>/^[0-9A-Z]{4,12}$/.test(code)));}

async function fetchRows(endpoints,{logger=console,label}={}){const errors=[];for(const endpoint of endpoints){try{const rows=endpoint.format==='csv'?parseOfficialCsv(await fetchOfficialText(endpoint.url,{attempts:2,retryDelaysMs:[30_000]})):await fetchOfficialJson(endpoint.url,{attempts:2,retryDelaysMs:[30_000]});if(!Array.isArray(rows)||!rows.length)throw new Error('official endpoint returned no rows');return{rows,endpoint:endpoint.url};}catch(error){errors.push({endpoint:endpoint.url,error:error.message});logger.error?.(JSON.stringify({event:'universe_endpoint_failed',market:endpoint.market,label,endpoint:endpoint.url,error:error.message}));}}throw Object.assign(new Error(`${label} unavailable from all official endpoints`),{details:errors});}

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

export async function loadOfficialSecurityMaster({logger=console}={}) {
  const marketLoads=await Promise.allSettled([
    fetchRows([{url:SECURITY_MASTER_URLS.twse,market:'twse',format:'json'},{url:SECURITY_MASTER_URLS.twseCompanyFallback,market:'twse',format:'csv'}],{logger,label:'TWSE company master'}),
    fetchRows([{url:SECURITY_MASTER_URLS.tpex,market:'tpex',format:'json'},{url:SECURITY_MASTER_URLS.tpexCompanyFallback,market:'tpex',format:'csv'}],{logger,label:'TPEX company master'})
  ]);
  const missing=[];if(marketLoads[0].status==='rejected')missing.push({market:'twse',error:marketLoads[0].reason.message,details:marketLoads[0].reason.details});if(marketLoads[1].status==='rejected')missing.push({market:'tpex',error:marketLoads[1].reason.message,details:marketLoads[1].reason.details});
  if(missing.length)throw Object.assign(new Error(`Official universe incomplete: ${missing.map(item=>item.market).join(', ')}`),{missingMarkets:missing});
  const [twseCompanies,tpexCompanies]=marketLoads.map(result=>result.value);
  const productLoads=await Promise.allSettled([
    fetchRows([{url:SECURITY_MASTER_URLS.twseProducts,market:'twse',format:'json'},{url:SECURITY_MASTER_URLS.twseProductsFallback,market:'twse',format:'csv'}],{logger,label:'TWSE fund master'}),
    fetchRows([{url:SECURITY_MASTER_URLS.tpexProducts,market:'tpex',format:'json'},{url:SECURITY_MASTER_URLS.tpexProductsFallback,market:'tpex',format:'csv'}],{logger,label:'TPEX securities master'})
  ]);
  const missingProducts=[];if(productLoads[0].status==='rejected')missingProducts.push({market:'twse',error:productLoads[0].reason.message,details:productLoads[0].reason.details});if(productLoads[1].status==='rejected')missingProducts.push({market:'tpex',error:productLoads[1].reason.message,details:productLoads[1].reason.details});
  if(missingProducts.length)throw Object.assign(new Error(`Official fund classification incomplete: ${missingProducts.map(item=>item.market).join(', ')}`),{missingMarkets:missingProducts});
  const twseFunds=productLoads[0].status==='fulfilled'?productLoads[0].value:{rows:[],endpoint:null},tpexFunds=productLoads[1].status==='fulfilled'?productLoads[1].value:{rows:[],endpoint:null};
  const companies={...parseSecurityMaster(twseCompanies.rows,'twse',twseCompanies.endpoint),...parseSecurityMaster(tpexCompanies.rows,'tpex',tpexCompanies.endpoint)};
  const allProducts={...parseFundMaster(twseFunds.rows,'twse',twseFunds.endpoint),...parseFundMaster(tpexFunds.rows,'tpex',tpexFunds.endpoint)};
  const products=Object.fromEntries(Object.entries(allProducts).filter(([code])=>!companies[code]));
  const sources={twseCompany:twseCompanies.endpoint,tpexCompany:tpexCompanies.endpoint,twseFund:twseFunds.endpoint,tpexFund:tpexFunds.endpoint};
  return {companies,products,sources,marketCounts:{twse:Object.values(companies).filter(item=>item.market==='twse').length,tpex:Object.values(companies).filter(item=>item.market==='tpex').length},officialEtfSymbols:Object.values(products).map(item=>item.code)};
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
