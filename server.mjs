import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readJson } from './src/storage.mjs';
import { readLatestScan, scanFreshness } from './src/scan-result.mjs';
import { API_ROUTES, apiError, scanResponse } from './src/api-contract.mjs';
import { createScanRunner } from './src/scan-runner.mjs';

const moduleRoot = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
  res.end(JSON.stringify(body));
}

export function createApp({ root = moduleRoot, dataDir = resolve(root, process.env.DATA_DIR ?? 'data'), runner = createScanRunner({ root, dataDir }), logger = console } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === API_ROUTES.scan) {
        const latest = await readLatestScan(join(dataDir, 'latest-scan.json'));
        if (latest) return sendJson(res, 200, scanResponse(latest, scanFreshness(latest)));
        const scan = runner.state();
        const error = scan.status === 'failed'
          ? apiError(503, 'LIVE_SCAN_FAILED', 'Official live scan failed; no recommendation data is available', { scan })
          : apiError(202, 'LIVE_SCAN_PENDING', 'Official live scan is still running; no recommendation data is available yet', { scan });
        return sendJson(res, error.status, error.body);
      }
      if (url.pathname === API_ROUTES.coverage) {
        const latest = await readLatestScan(join(dataDir, 'latest-scan.json'));
        if (!latest) {
          const error = apiError(503, 'COVERAGE_UNAVAILABLE', 'Coverage is unavailable until the official live scan completes', { scan:runner.state() });
          return sendJson(res, error.status, error.body);
        }
        const diagnostics = latest.historyDiagnostics ?? {};
        const universe = latest.universe ?? {};
        return sendJson(res, 200, { ok:true, dataSource:latest.provider, candidateCount:latest.coverage?.total ?? 0, universeCount:diagnostics.universeCount ?? latest.coverage?.total ?? 0, rawUniverseCount:universe.rawUniverseCount ?? 0, includedCommonStockCount:universe.includedCommonStockCount ?? 0, excludedEtfFundCount:universe.excludedEtfFundCount ?? 0, excludedFinancialCount:universe.excludedFinancialCount ?? 0, excludedConstructionCount:universe.excludedConstructionCount ?? 0, excludedOtherSecurityCount:universe.excludedOtherSecurityCount ?? 0, exclusionReasons:universe.exclusionReasons ?? {}, historyQueueTotal:diagnostics.historyQueueTotal ?? 0, historyQueueProcessed:diagnostics.historyQueueProcessed ?? 0, historyQueueRemaining:diagnostics.historyQueueRemaining ?? 0, historySuccessCount:diagnostics.historySuccessCount ?? 0, historyFailureCount:diagnostics.historyFailureCount ?? 0, dailyCoverageCount:latest.coverage?.dailyBars ?? 0, weeklyCoverageCount:latest.coverage?.weeklyBars ?? 0, missingFundamentalFields:latest.coverage?.missingFundamentalFields ?? {}, insufficientData:latest.insufficientData ?? [], insufficientByReason:diagnostics.insufficientByReason ?? {}, historyDiagnostics:diagnostics, coverage:latest.coverage });
      }
      if (url.pathname === API_ROUTES.health) {
        const history = await readJson(join(dataDir, 'scan-history.json'), []);
        const latest = await readLatestScan(join(dataDir, 'latest-scan.json'));
        return sendJson(res, 200, { ok:true, engine:'v3.0', scan:runner.state(), scanCount:history.length, dataMode:latest?.provider ?? 'missing', freshness:scanFreshness(latest), release:latest?.release ?? { publish:false, failures:['Official live scan has not completed'] }, coverage:latest?.coverage ?? null });
      }
      if (url.pathname.startsWith('/api/')) {
        const error = apiError(404, 'API_ROUTE_NOT_FOUND', `No API route exists for ${url.pathname}`);
        logger.error(JSON.stringify({ event:'api_route_not_found', method:req.method, path:url.pathname }));
        return sendJson(res, error.status, error.body);
      }
      const relative = url.pathname === '/' ? 'public/index.html' : `public/${url.pathname.replace(/^\//, '')}`;
      const path = resolve(root, relative);
      if (!path.startsWith(resolve(root, 'public'))) throw Object.assign(new Error('Invalid static path'), { statusCode:400 });
      const data = await readFile(path);
      res.writeHead(200, { 'content-type':types[extname(path)] || 'application/octet-stream' });
      return res.end(data);
    } catch (error) {
      const status = error.code === 'ENOENT' ? 404 : (error.statusCode ?? 500);
      logger.error(JSON.stringify({ event:'request_failed', method:req.method, path:url.pathname, status, error:error.message, stack:error.stack }));
      if (url.pathname.startsWith('/api/')) return sendJson(res, status, apiError(status, status === 404 ? 'API_RESOURCE_NOT_FOUND' : 'INTERNAL_SERVER_ERROR', error.message).body);
      res.writeHead(status, { 'content-type':'text/plain; charset=utf-8' });
      return res.end(status === 404 ? 'Not found' : 'Internal server error');
    }
  });
}

export function startServer() {
  const root = moduleRoot;
  const dataDir = resolve(root, process.env.DATA_DIR ?? 'data');
  const runner = createScanRunner({ root, dataDir });
  const server = createApp({ root, dataDir, runner });
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`TW Stock System: http://${host}:${port}`);
    if (process.env.AUTO_SCAN !== '0') runner.start();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
