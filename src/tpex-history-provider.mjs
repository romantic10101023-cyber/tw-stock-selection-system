import { fetchOfficialText } from './live-provider.mjs';
import { mergeBars, normalizeBar, validateBars } from './ohlcv.mjs';

const TPEX_HISTORY = (code, year, month) => {
  const rocYear = year - 1911;
  return `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${String(month).padStart(2, '0')}&stkno=${code}`;
};

function cells(html) {
  return [...html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, ' ').trim());
}

function parseRows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => cells(match[1])).filter(row => row.length >= 7);
}

function number(value) { const n = Number(String(value ?? '').replaceAll(',', '')); return Number.isFinite(n) ? n : null; }
function parseDate(value) {
  const match = String(value).match(/(\d{2,3})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return match ? `${Number(match[1]) + 1911}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}` : null;
}

export async function loadTpexHistory(code, asOf = '2026-08-13', months = 18) {
  const end = new Date(`${asOf}T00:00:00Z`);
  let bars = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    const rows = parseRows(await fetchOfficialText(TPEX_HISTORY(code, date.getUTCFullYear(), date.getUTCMonth() + 1)));
    const monthBars = rows.map(row => normalizeBar({ date:parseDate(row[0]), open:row[3], high:row[4], low:row[5], close:row[6], volume:row[1] })).filter(bar => bar.date);
    bars = mergeBars(bars, monthBars);
  }
  const validation = validateBars(bars, asOf);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  if (bars.length < 120) throw new Error(`${code} 上櫃日線不足120根，目前${bars.length}根`);
  return { code, bars, dailyBars:bars.length, weeklyBars:Math.floor(bars.length / 5), source:'live', asOf };
}
