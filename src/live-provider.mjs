import { SOURCE_STATUS, normalizeStock } from './data-model.mjs';
import { parseOfficialCsv } from './official-csv.mjs';

const TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const TWSE_FALLBACK_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=csv';
const TPEX_PRIMARY_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes';
export const MIN_REQUEST_INTERVAL_MS = 1200;
export const OFFICIAL_TIMEOUT_MS = 45_000;
export const OFFICIAL_ATTEMPTS = 5;
export const OFFICIAL_RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 240_000];
let lastRequestAt = 0;
let requestGate = Promise.resolve();
let requestState = { endpoint:null, retry:0, attempts:0, timeoutSeconds:OFFICIAL_TIMEOUT_MS / 1000, status:null, recovering:false, lastError:null, updatedAt:null };
const circuits = new Map();
const CIRCUIT_THRESHOLD = 3, CIRCUIT_COOLDOWN_MS = 60_000;

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
export const getOfficialCircuitState = () => ({ circuitOpen:[...circuits.entries()].filter(([,state])=>state.openUntil>Date.now()).map(([endpoint,state])=>({endpoint,openUntil:new Date(state.openUntil).toISOString(),failures:state.failures})), timeoutCount:[...circuits.values()].reduce((sum,state)=>sum+(state.timeoutCount??0),0) });

const circuitKey = value => { const url=new URL(value); return `${url.origin}${url.pathname}`; };
function circuitBefore(url){const key=circuitKey(url),state=circuits.get(key);if(state?.openUntil>Date.now())throw Object.assign(new Error(`Official endpoint circuit open until ${new Date(state.openUntil).toISOString()}: ${key}`),{circuitOpen:true,endpoint:key});if(state?.openUntil)circuits.set(key,{...state,failures:0,openUntil:0});return key;}
function circuitSuccess(key){circuits.set(key,{failures:0,openUntil:0,timeoutCount:circuits.get(key)?.timeoutCount??0});}
function circuitFailure(key,error){if(!retryable(error))return;const previous=circuits.get(key)??{failures:0,openUntil:0,timeoutCount:0},failures=previous.failures+1;circuits.set(key,{failures,timeoutCount:previous.timeoutCount+(error.timeout?1:0),openUntil:failures>=CIRCUIT_THRESHOLD?Date.now()+CIRCUIT_COOLDOWN_MS:0});}

function retryable(error) {
  return error?.timeout === true || error?.name === 'AbortError' || [429, 502, 503, 504].includes(error?.status) || error?.network === true;
}

export async function fetchOfficial(url, { responseType = 'json', timeoutMs = OFFICIAL_TIMEOUT_MS, attempts = OFFICIAL_ATTEMPTS, retryDelaysMs = OFFICIAL_RETRY_DELAYS_MS, minIntervalMs = MIN_REQUEST_INTERVAL_MS, fetchImpl = fetch, sleepImpl = sleep, logger = console, method = 'GET', body, signal } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const key=circuitBefore(url);
    await waitForSlot(minIntervalMs, sleepImpl);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    requestState = { endpoint:url, retry:attempt, attempts, timeoutSeconds:timeoutMs / 1000, status:null, recovering:attempt > 1, lastError:attempt > 1 ? requestState.lastError : null, requestStartedAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
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
      circuitSuccess(key);
      return result;
    } catch (error) {
      if (timedOut || error?.name === 'AbortError') Object.assign(error, { timeout:true });
      else if (!('status' in error)) Object.assign(error, { network:true });
      lastError = error;
      circuitFailure(key,error);
      requestState = { ...requestState, status:error.status ?? null, recovering:true, lastError:error.message, updatedAt:new Date().toISOString() };
      logger.error?.(JSON.stringify({ event:'official_api_error', endpoint:url, attempt, attempts, status:error.status ?? null, responseBody:String(error.responseBody ?? '').slice(0, 500), timeoutSeconds:timeoutMs / 1000, timeout:Boolean(error.timeout), retryable:retryable(error), error:error.message }));
      if (attempt >= attempts || !retryable(error)) break;
      await sleepImpl(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? retryDelaysMs.at(-1) ?? 30_000);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort',abort);
    }
  }
  throw new Error(`Official API failed after ${requestState.retry} attempts: ${url}: ${lastError?.message ?? 'unknown error'}`, { cause:lastError });
}

export const fetchOfficialJson = (url, options) => fetchOfficial(url, { ...options, responseType:'json' });
export const fetchOfficialText = (url, options) => fetchOfficial(url, { ...options, responseType:'text' });
export const fetchOfficialBuffer = (url, options) => fetchOfficial(url, { ...options, responseType:'buffer' });

function mapTwse(row, asOf) {
  return normalizeStock({ code:row.Code??row['證券代號'], name:row.Name??row['證券名稱'], market:'twse', price:number(row.ClosingPrice??row['收盤價']), volume5:number(row.TradeVolume??row['成交股數']) / 1000, asOf, dataDate:asOf, source:SOURCE_STATUS.LIVE, sourceRefs:[row.__endpoint??TWSE_URL] });
}

function mapTpex(row, asOf) {
  return normalizeStock({ code:row.SecuritiesCompanyCode ?? row.Code, name:row.CompanyName ?? row.Name, market:'tpex', price:number(row.Close ?? row.ClosePrice), volume5:number(row.TradingShares) / 1000, asOf, dataDate:asOf, source:SOURCE_STATUS.LIVE, sourceRefs:[row.__endpoint??TPEX_URL] });
}

async function quoteRows(endpoints,market,logger=console){const errors=[];for(const endpoint of endpoints){try{const rows=endpoint.format==='csv'?parseOfficialCsv(await fetchOfficialText(endpoint.url,{attempts:2,retryDelaysMs:[30_000]})):await fetchOfficialJson(endpoint.url,{attempts:2,retryDelaysMs:[30_000]});if(!Array.isArray(rows)||!rows.length)throw new Error('official quote endpoint returned no rows');return{rows:rows.map(row=>({...row,__endpoint:endpoint.url})),endpoint:endpoint.url};}catch(error){errors.push({endpoint:endpoint.url,error:error.message});logger.error?.(JSON.stringify({event:'quote_endpoint_failed',market,endpoint:endpoint.url,error:error.message}));}}throw Object.assign(new Error(`${market.toUpperCase()} official quotes unavailable`),{details:errors});}

export async function loadOfficialQuotes(asOf,{logger=console}={}) {
  const loads=await Promise.allSettled([
    quoteRows([{url:TWSE_URL,format:'json'},{url:TWSE_FALLBACK_URL,format:'csv'}],'twse',logger),
    quoteRows([{url:TPEX_PRIMARY_URL,format:'json'},{url:TPEX_URL,format:'json'}],'tpex',logger)
  ]);
  const missing=[];if(loads[0].status==='rejected')missing.push({market:'twse',details:loads[0].reason.details});if(loads[1].status==='rejected')missing.push({market:'tpex',details:loads[1].reason.details});if(missing.length)throw Object.assign(new Error(`Official quotes incomplete: ${missing.map(item=>item.market).join(', ')}`),{missingMarkets:missing});
  const twse=loads[0].value.rows,tpex=loads[1].value.rows;
  const rows = [
    ...(Array.isArray(twse) ? twse.map(row => mapTwse(row, asOf)) : []),
    ...(Array.isArray(tpex) ? tpex.map(row => mapTpex(row, asOf)) : [])
  ].filter(stock => /^[0-9A-Z-]{4,12}$/i.test(stock.code) && Number.isFinite(stock.price));
  const deduplicated=[...new Map(rows.map(stock=>[`${stock.market}:${stock.code}`,stock])).values()];
  if (!deduplicated.length) throw new Error('Official TWSE/TPEX quote APIs returned no valid stocks');
  Object.defineProperty(deduplicated,'sources',{value:{twse:loads[0].value.endpoint,tpex:loads[1].value.endpoint},enumerable:false});
  return deduplicated;
}
