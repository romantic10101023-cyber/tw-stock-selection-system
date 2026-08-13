import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './src/storage.mjs';
import { readLatestScan, scanFreshness } from './src/scan-result.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(root, process.env.DATA_DIR ?? 'data');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

const emptyScan = asOf => ({
  asOf, provider:'missing', validation:{ ok:false, errors:['尚未完成正式掃描'] }, coverage:{ total:0, dailyBars:0, weeklyBars:0, eligible:0, insufficient:0, details:[] },
  universe:{ input:0, included:0, excluded:0 }, marketMode:'range', ranked:[], top12:[], top3:[], watch:[], insufficientData:[],
  release:{ publish:false, failures:['尚未完成正式掃描；不使用示範資料產生推薦'] }
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/scan') {
      const latest = await readLatestScan(join(dataDir, 'latest-scan.json'));
      const payload = latest ? { ...latest, freshness:scanFreshness(latest) } : emptyScan(process.env.MARKET_DATE ?? new Date().toISOString().slice(0, 10));
      res.writeHead(200, { 'content-type':'application/json; charset=utf-8' });
      return res.end(JSON.stringify(payload));
    }
    if (req.url === '/api/health') {
      const history = await readJson(join(dataDir, 'scan-history.json'), []);
      const latest = await readLatestScan(join(dataDir, 'latest-scan.json'));
      res.writeHead(200, { 'content-type':'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok:true, engine:'v3.0', scanCount:history.length, dataMode:latest?.provider ?? 'none', freshness:scanFreshness(latest), release:latest?.release ?? { publish:false, failures:['尚未產生正式掃描結果'] }, factorSources:latest?.factorSources ?? {}, coverage:latest?.coverage ?? null }));
    }
    const path = req.url === '/' ? '/public/index.html' : `/public${req.url}`;
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'content-type':types[extname(path)] || 'application/octet-stream' });
    return res.end(data);
  } catch (error) {
    console.error(JSON.stringify({ event:'http_error', path:req.url, error:error.message }));
    res.writeHead(404);
    return res.end('Not found');
  }
});

server.listen(port, host, () => console.log(`TW Stock System: http://${host}:${port}`));
