import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readJson } from './src/storage.mjs';
import { readLatestScan, scanFreshness } from './src/scan-result.mjs';
import { API_ROUTES, apiError, scanResponse } from './src/api-contract.mjs';
import { createScanCoordinator } from './src/scan-coordinator.mjs';
import { runProductionBatch } from './src/production-batch.mjs';

const moduleRoot = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
  res.end(JSON.stringify(body));
}

export function createApp({ root = moduleRoot, dataDir = resolve(root, process.env.DATA_DIR ?? 'data'), runner = createScanCoordinator({ runBatch:()=>runProductionBatch({dataDir}) }), logger = console } = {}) {
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
        const checkpoint = await readJson(join(dataDir, 'checkpoint.json'), null);
        const total = universe.includedCommonStockCount ?? latest.coverage?.total ?? 0;
        const daily = latest.coverage?.dailyBars ?? 0, weekly = latest.coverage?.weeklyBars ?? 0;
        return sendJson(res, 200, { ok:true, dataSource:latest.provider, candidateCount:latest.coverage?.total ?? 0, universeCount:diagnostics.universeCount ?? latest.coverage?.total ?? 0, rawUniverseCount:universe.rawUniverseCount ?? 0, includedCommonStockCount:total, officialEtfCount:universe.officialEtfCount ?? 0, excludedEtfFundCount:universe.excludedEtfFundCount ?? 0, excludedFinancialCount:universe.excludedFinancialCount ?? 0, excludedConstructionCount:universe.excludedConstructionCount ?? 0, excludedOtherSecurityCount:universe.excludedOtherSecurityCount ?? 0, excludedEtfSymbols:universe.excludedEtfSymbols ?? [], excludedEtfNames:universe.excludedEtfNames ?? [], exclusionReasons:universe.exclusionReasons ?? {}, classificationSource:universe.classificationSource ?? [], historyQueueTotal:checkpoint?.total??diagnostics.historyQueueTotal??0, historyQueueProcessed:checkpoint?.processed??diagnostics.historyQueueProcessed??0, historyQueueRemaining:checkpoint?.remaining??diagnostics.historyQueueRemaining??0, historySuccessCount:checkpoint?.successCount??diagnostics.historySuccessCount??0, historyFailureCount:checkpoint?.deadLetterCount??diagnostics.historyFailureCount??0, dailyCoverageCount:checkpoint?.dailyCoverageCount??daily, weeklyCoverageCount:checkpoint?.weeklyCoverageCount??weekly, dailyCoveragePercent:checkpoint?.total?Math.round((checkpoint.dailyCoverageCount??0)/checkpoint.total*1000)/10:0, weeklyCoveragePercent:checkpoint?.total?Math.round((checkpoint.weeklyCoverageCount??0)/checkpoint.total*1000)/10:0, incompleteHistoryReasons:diagnostics.insufficientByReason ?? {}, missingFundamentalFields:latest.coverage?.missingFundamentalFields ?? {}, insufficientData:latest.insufficientData ?? [], insufficientByReason:diagnostics.insufficientByReason ?? {}, historyDiagnostics:diagnostics, queueCheckpoint:checkpoint, lastUpdatedAt:checkpoint?.lastProgressAt ?? latest.runAt, coverage:latest.coverage });
      }
      if (url.pathname === API_ROUTES.health) {
        const history = await readJson(join(dataDir, 'scan-history.json'), []);
        const latest = await readLatestScan(join(dataDir, 'latest-scan.json'));
        const checkpoint = await readJson(join(dataDir, 'checkpoint.json'), null);
        const lock = await readJson(join(dataDir, 'worker-lock.json'), null);
        const persistenceStatus=checkpoint?.persistenceStatus??(process.env.RAILWAY_VOLUME_MOUNT_PATH||process.env.PERSISTENT_STORAGE==='1'?'configured':'not_configured');
        const lastProgress=checkpoint?.lastProgressAt?new Date(checkpoint.lastProgressAt).getTime():0,stalled=Boolean(checkpoint?.remaining&&lastProgress&&Date.now()-lastProgress>20*60*1000);
        return sendJson(res, 200, { ok:true, engine:'v3.0', scan:{ ...runner.state(), status:runner.state().status==='idle'?(checkpoint?.status??'idle'):runner.state().status,lastStartedAt:checkpoint?.lastStartedAt??runner.state().startedAt,lastFinishedAt:checkpoint?.lastFinishedAt??runner.state().finishedAt,lastExitCode:checkpoint?.lastExitCode??runner.state().exitCode,currentBatch:checkpoint?.currentBatch??0,batchSize:checkpoint?.batchSize??10,processed:checkpoint?.processed??0,remaining:checkpoint?.remaining??0,successCount:checkpoint?.successCount??0,failedCount:checkpoint?.failedCount??0,retryCount:checkpoint?.retryCount??checkpoint?.retryableCount??0,retryableCount:checkpoint?.retryableCount??0,deadLetterCount:checkpoint?.deadLetterCount??0,staleRecovered:checkpoint?.staleRecovered??0,dailyCoverageCount:checkpoint?.dailyCoverageCount??0,weeklyCoverageCount:checkpoint?.weeklyCoverageCount??0,dailyCoveragePercent:checkpoint?.total?Math.round((checkpoint.dailyCoverageCount??0)/checkpoint.total*1000)/10:0,weeklyCoveragePercent:checkpoint?.total?Math.round((checkpoint.weeklyCoverageCount??0)/checkpoint.total*1000)/10:0,lastProgressAt:checkpoint?.lastProgressAt??null,stalled,stalledReason:stalled?'No checkpoint progress for more than 20 minutes':null,lockStatus:lock?'locked':'available',queueFile:join(dataDir,'queue.json'),persistenceStatus,lastError:checkpoint?.lastError??runner.state().error??null }, scanCount:history.length, dataMode:latest?.provider ?? 'missing', freshness:scanFreshness(latest), release:latest?.release ?? { publish:false, failures:['Official live scan has not completed'] }, coverage:latest?.coverage ?? null });
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
  const runner = createScanCoordinator({ runBatch:()=>runProductionBatch({dataDir}) });
  const server = createApp({ root, dataDir, runner });
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`TW Stock System: http://${host}:${port}`);
    if (process.env.AUTO_SCAN === '1') runner.start();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
