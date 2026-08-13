import { readJson } from './storage.mjs';

export function createFileCache(path) {
  return async (asOf) => {
    const payload = await readJson(path, null);
    if (!payload?.stocks?.length) return [];
    return payload.stocks.map(stock => ({ ...stock, asOf, source: 'cached', sourceRefs: [...(stock.sourceRefs ?? []), path] }));
  };
}
