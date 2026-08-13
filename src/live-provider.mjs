import { SOURCE_STATUS, normalizeStock } from './data-model.mjs';

const TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
export const MIN_REQUEST_INTERVAL_MS = 1200;
let lastRequestAt = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function number(value) {
  if (value === null || value === undefined || value === '' || value === '--') return NaN;
  return Number(String(value).replaceAll(',', '').replace(/[＋+]/g, '').replace(/[－−]/g, '-'));
}

async function waitForSlot() {
  const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (waitMs) await sleep(waitMs);
  lastRequestAt = Date.now();
}

export async function fetchOfficial(url, { responseType = 'json', timeoutMs = 15000, attempts = 3, fetchImpl = fetch, logger = console, method = 'GET', body } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await waitForSlot();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        body,
        signal: controller.signal,
        headers: {
          accept:responseType === 'json' ? 'application/json' : 'text/html,text/plain',
          'user-agent':'TW-Stock-System/3.0',
          ...(body instanceof URLSearchParams ? { 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' } : {})
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return responseType === 'json' ? await response.json() : await response.text();
    } catch (error) {
      lastError = error;
      logger.error?.(JSON.stringify({ event:'official_api_error', url, attempt, attempts, error:error.message }));
      if (attempt < attempts) await sleep(1000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Official API failed after ${attempts} attempts: ${url}: ${lastError?.message ?? 'unknown error'}`);
}

export const fetchOfficialJson = (url, options) => fetchOfficial(url, { ...options, responseType:'json' });
export const fetchOfficialText = (url, options) => fetchOfficial(url, { ...options, responseType:'text' });

function mapTwse(row, asOf) {
  return normalizeStock({ code:row.Code, name:row.Name, market:'twse', price:number(row.ClosingPrice), volume5:number(row.TradeVolume) / 1000, asOf, dataDate:asOf, source:SOURCE_STATUS.LIVE, sourceRefs:[TWSE_URL] });
}

function mapTpex(row, asOf) {
  return normalizeStock({ code:row.SecuritiesCompanyCode ?? row.Code, name:row.CompanyName ?? row.Name, market:'tpex', price:number(row.Close ?? row.ClosePrice), volume5:number(row.TradingShares) / 1000, asOf, dataDate:asOf, source:SOURCE_STATUS.LIVE, sourceRefs:[TPEX_URL] });
}

export async function loadOfficialQuotes(asOf) {
  const twse = await fetchOfficialJson(TWSE_URL);
  const tpex = await fetchOfficialJson(TPEX_URL);
  const rows = [
    ...(Array.isArray(twse) ? twse.map(row => mapTwse(row, asOf)) : []),
    ...(Array.isArray(tpex) ? tpex.map(row => mapTpex(row, asOf)) : [])
  ].filter(stock => /^\d{4}$/.test(stock.code) && Number.isFinite(stock.price));
  if (!rows.length) throw new Error('Official TWSE/TPEX quote APIs returned no valid stocks');
  return rows;
}
