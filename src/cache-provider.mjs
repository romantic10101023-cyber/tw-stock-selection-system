import { readJson } from './storage.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createFileCache(path) {
  return async (asOf) => {
    const payload = await readJson(path, null);
    if (!payload?.stocks?.length) return [];
    return payload.stocks.map(stock => ({ ...stock, asOf, source: 'cached', sourceRefs: [...(stock.sourceRefs ?? []), path] }));
  };
}

export async function writeQuoteCache(path, stocks, asOf) {
  await mkdir(dirname(path), { recursive:true });
  await writeFile(path, JSON.stringify({ asOf, cachedAt:new Date().toISOString(), stocks }, null, 2));
}
