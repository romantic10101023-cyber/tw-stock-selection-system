import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLists } from './src/engine.mjs';
import { demoStocks } from './src/demo-data.mjs';
import { validateBatch } from './src/data-model.mjs';
import { createProvider } from './src/provider.mjs';
import { readJson } from './src/storage.mjs';
import { loadOfficialQuotes } from './src/live-provider.mjs';
import { createFileCache } from './src/cache-provider.mjs';
import { classifyMarket } from './src/market-regime.mjs';
import { filterUniverse } from './src/universe.mjs';
import { historyInputs, readMarketHistory } from './src/market-history.mjs';
import { readLatestScan, scanFreshness } from './src/scan-result.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
const useOfficial = process.env.USE_OFFICIAL_DATA === '1';
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const provider = createProvider({ liveLoader: useOfficial ? loadOfficialQuotes : undefined, cachedLoader: createFileCache(join(root, 'data/quotes-cache.json')), demoLoader: async () => demoStocks });
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/scan') {
      const latest = await readLatestScan(join(root, 'data/latest-scan.json'));
      if (latest) {
        res.writeHead(200, {'content-type':'application/json; charset=utf-8'});
        return res.end(JSON.stringify({ ...latest, freshness: scanFreshness(latest) }));
      }
      const asOf = process.env.MARKET_DATE ?? '2026-08-12';
      const loaded = await provider.load(asOf);
      const validation = validateBatch(loaded.stocks, asOf);
      const universe = filterUniverse(loaded.stocks);
      const marketHistory = await readMarketHistory(join(root, 'data/market-history.json'));
      const market = classifyMarket(historyInputs(marketHistory));
      res.writeHead(200, {'content-type':'application/json; charset=utf-8'});
      return res.end(JSON.stringify({ asOf, provider: loaded.status, validation, universe: universe.counts, market, marketMode:market.mode, ...buildLists(universe.included,market.mode) }));
    }
    if (req.url === '/api/health') {
      const history = await readJson(join(root, 'data/scan-history.json'), []);
      const latest = await readLatestScan(join(root, 'data/latest-scan.json'));
      res.writeHead(200, {'content-type':'application/json; charset=utf-8'});
      return res.end(JSON.stringify({ ok:true, engine:'v3.0', scanCount:history.length, dataMode:latest?.provider ?? 'none', freshness:scanFreshness(latest), release:latest?.release ?? {publish:false, failures:['尚未產生掃描結果']}, factorSources:latest?.factorSources ?? {}, coverage:latest?.coverage ?? null }));
    }
    const path = req.url === '/' ? '/public/index.html' : `/public${req.url}`;
    const data = await readFile(join(root, path));
    res.writeHead(200, {'content-type': types[extname(path)] || 'application/octet-stream'}); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, host, () => console.log(`TW Stock System: http://localhost:${port}`));
