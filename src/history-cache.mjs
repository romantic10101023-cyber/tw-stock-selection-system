import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mergeBars, validateBars } from './ohlcv.mjs';
import { aggregateWeeklyBars } from './technical.mjs';

export async function readHistoryCache(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

export async function writeHistoryCache(path, code, payload, asOf) {
  const bars = mergeBars([], payload.bars ?? []);
  const validation = validateBars(bars, asOf);
  if (!validation.ok) throw new Error(`${code} history cache validation failed: ${validation.errors.join('; ')}`);
  const cache = await readHistoryCache(path);
  cache[code] = { ...payload, bars, dailyBars:bars.length, weeklyBars:aggregateWeeklyBars(bars).length, cachedAt:new Date().toISOString() };
  await mkdir(dirname(path), { recursive:true });
  await writeFile(path, JSON.stringify(cache, null, 2));
  return cache[code];
}

export async function getCachedHistory(path, code, asOf) {
  const payload = (await readHistoryCache(path))[code];
  if (!payload?.bars?.length) return null;
  const bars = mergeBars([], payload.bars).filter(bar => bar.date <= asOf);
  const validation = validateBars(bars, asOf);
  return validation.ok ? { ...payload, bars, dailyBars:bars.length, weeklyBars:aggregateWeeklyBars(bars).length, source:'cached' } : null;
}
