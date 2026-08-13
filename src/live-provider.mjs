import { SOURCE_STATUS, normalizeStock } from './data-model.mjs';

const TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const TPEx_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const MIN_REQUEST_INTERVAL_MS = 1200;
let lastRequestAt = 0;

function number(value) {
  if (value === null || value === undefined || value === '' || value === '--') return NaN;
  return Number(String(value).replaceAll(',', '').replaceAll('－', '-'));
}

async function waitForSlot() {
  const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
}

async function getJson(url, timeoutMs = 12000, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await waitForSlot();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'TW-Stock-System/0.3' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

export async function fetchOfficialJson(url) { return getJson(url); }

export async function fetchOfficialText(url) {
  await waitForSlot();
  const response = await fetch(url, { headers: { accept: 'text/html,text/plain', 'user-agent': 'TW-Stock-System/0.3' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function mapTwse(row, asOf) {
    return normalizeStock({ code: row.Code, name: row.Name, market:'twse', price: number(row.ClosingPrice), volume5: number(row.TradeVolume) / 1000, asOf, dataDate: asOf, source: SOURCE_STATUS.LIVE, sourceRefs: [TWSE_URL] });
}

function mapTpex(row, asOf) {
  return normalizeStock({ code: row.SecuritiesCompanyCode ?? row.Code, name: row.CompanyName ?? row.Name, market:'tpex', price: number(row.Close ?? row.ClosePrice), volume5: number(row.TradingShares) / 1000, asOf, dataDate: asOf, source: SOURCE_STATUS.LIVE, sourceRefs: [TPEx_URL] });
}

export async function loadOfficialQuotes(asOf) {
  // 官方批次接口順序抓取，避免同時對兩個來源發出請求。
  const twse = await getJson(TWSE_URL);
  const tpex = await getJson(TPEx_URL);
  const rows = [...(Array.isArray(twse) ? twse.map(x => mapTwse(x, asOf)) : []), ...(Array.isArray(tpex) ? tpex.map(x => mapTpex(x, asOf)) : [])];
  if (!rows.length) throw new Error('官方行情回傳空資料');
  return rows;
}
