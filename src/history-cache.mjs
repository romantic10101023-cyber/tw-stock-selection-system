import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mergeBars, validateBars } from './ohlcv.mjs';

export async function readHistoryCache(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {}; }
}

export async function writeHistoryCache(path, code, payload, asOf) {
  const validation = validateBars(payload.bars ?? [], asOf);
  if (!validation.ok || validation.count < 120) throw new Error(`${code} 快取未通過K線驗證`);
  const cache = await readHistoryCache(path);
  cache[code] = { ...payload, bars: mergeBars([], payload.bars), cachedAt: new Date().toISOString() };
  await mkdir(dirname(path), { recursive:true });
  await writeFile(path, JSON.stringify(cache, null, 2));
  return cache[code];
}

export async function getCachedHistory(path, code, asOf) {
  const cache = await readHistoryCache(path);
  const payload = cache[code];
  if (!payload?.bars?.length) return null;
  const validation = validateBars(payload.bars, asOf);
  return validation.ok && payload.bars.length >= 120 ? payload : null;
}
