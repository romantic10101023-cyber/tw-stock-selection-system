import { SOURCE_STATUS, normalizeStock } from './data-model.mjs';

const TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
export const MIN_REQUEST_INTERVAL_MS = 1200;
export const OFFICIAL_TIMEOUT_MS = 45_000;
export const OFFICIAL_ATTEMPTS = 5;
export const OFFICIAL_RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 240_000];
let lastRequestAt = 0;
let requestGate = Promise.resolve();
let requestState = { endpoint:null, retry:0, attempts:0, timeoutSeconds:OFFICIAL_TIMEOUT_MS / 1000, status:null, recovering:false, lastError:null, updatedAt:null };

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function number(value) {
  if (value === null || value === undefined || value === '' || value === '--') return NaN;
  return Number(String(value).replaceAll(',', '').replace(/[＋+]/g, '').replace(/[－−]/g, '-'));
}

async function waitForSlot(minIntervalMs, sleepImpl) {
  const previous = requestGate;
  let release;
  requestGate = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    const waitMs = Math.max(0, minIntervalMs - (Date.now() - lastRequestAt));
    if (waitMs) await sleepImpl(waitMs);
    lastRequestAt = Date.now();
  } finally { release(); }
}

export const getOfficialRequestState = () => ({ ...requestState });

function retryable(error) {
  return error?.timeout === true || error?.name === 'AbortError' || [429, 502, 503, 504].includes(error?.status) || error?.network === true;
}

export async function fetchOfficial(url, { responseType = 'json', timeoutMs = OFFICIAL_TIMEOUT_MS, attempts = OFFICIAL_ATTEMPTS, retryDelaysMs = OFFICIAL_RETRY_DELAYS_MS, minIntervalMs = MIN_REQUEST_INTERVAL_MS, fetchImpl = fetch, sleepImpl = sleep, logger = console, method = 'GET', body } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await waitForSlot(minIntervalMs, sleepImpl);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    requestState = { endpoint:url, retry:attempt, attempts, timeoutSeconds:timeoutMs / 1000, status:null, recovering:attempt > 1, lastError:attempt > 1 ? requestState.lastError : null, updatedAt:new Date().toISOString() };
    try {
      const response = await fetchImpl(url, {
        method,
        body,
        signal: controller.signal,
        headers: {
          accept:responseType === 'json' ? 'application/json' : 'text/html,text/plain,application/octet-stream',
          'user-agent':'TW-Stock-System/3.0',
          ...(body instanceof URLSearchParams ? { 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' } : {})
        }
      });
      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        const error = new Error(`HTTP ${response.status} ${response.statusText}`);
        Object.assign(error, { status:response.status, responseBody:responseBody.slice(0, 500) });
        throw error;
      }
      const result = responseType === 'json' ? await response.json() : responseType === 'buffer' ? await response.arrayBuffer() : await response.text();
      requestState = { ...requestState, status:response.status, recovering:false, lastError:null, updatedAt:new Date().toISOString() };
      return result;
    } catch (error) {
      if (timedOut || error?.name === 'AbortError') Object.assign(error, { timeout:true });
      else if (!('status' in error)) Object.assign(error, { network:true });
      lastError = error;
      requestState = { ...requestState, status:error.status ?? null, recovering:true, lastError:error.message, updatedAt:new Date().toISOString() };
      logger.error?.(JSON.stringify({ event:'official_api_error', endpoint:url, attempt, attempts, status:error.status ?? null, responseBody:String(error.responseBody ?? '').slice(0, 500), timeoutSeconds:timeoutMs / 1000, timeout:Boolean(error.timeout), retryable:retryable(error), error:error.message }));
      if (attempt >= attempts || !retryable(error)) break;
      await sleepImpl(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? retryDelaysMs.at(-1) ?? 30_000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Official API failed after ${requestState.retry} attempts: ${url}: ${lastError?.message ?? 'unknown error'}`, { cause:lastError });
}

export const fetchOfficialJson = (url, options) => fetchOfficial(url, { ...options, responseType:'json' });
export const fetchOfficialText = (url, options) => fetchOfficial(url, { ...options, responseType:'text' });
export const fetchOfficialBuffer = (url, options) => fetchOfficial(url, { ...options, responseType:'buffer' });

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
  ].filter(stock => /^[0-9A-Z-]{4,12}$/i.test(stock.code) && Number.isFinite(stock.price));
  if (!rows.length) throw new Error('Official TWSE/TPEX quote APIs returned no valid stocks');
  return rows;
}
