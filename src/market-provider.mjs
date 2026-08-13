import { fetchOfficialJson } from './live-provider.mjs';

const TWSE_INDEX_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX4';
const TPEX_INDEX_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_index';

const n = value => { const x = Number(String(value ?? '').replaceAll(',', '').replaceAll('%', '')); return Number.isFinite(x) ? x : null; };

export function parseMarketIndex(rows = []) {
  const row = rows.find(x => /發行量加權|加權指數|櫃買指數|Index/i.test(String(x['指數'] ?? x['指數名稱'] ?? x['Name'] ?? x['IndexName'] ?? ''))) ?? rows[0] ?? {};
  const close = n(row['收盤指數'] ?? row['收盤'] ?? row['Close'] ?? row['IndexValue']);
  const advancers = n(row['上漲家數'] ?? row['漲'] ?? row['Advancers']);
  const decliners = n(row['下跌家數'] ?? row['跌'] ?? row['Decliners']);
  return { close, advancers, decliners };
}

export async function loadOfficialMarket() {
  const twse = await fetchOfficialJson(TWSE_INDEX_URL);
  const tpex = await fetchOfficialJson(TPEX_INDEX_URL);
  return { twse: parseMarketIndex(Array.isArray(twse) ? twse : []), tpex: parseMarketIndex(Array.isArray(tpex) ? tpex : []), source: 'live' };
}
