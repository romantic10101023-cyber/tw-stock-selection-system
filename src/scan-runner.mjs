import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function createScanRunner({ root, dataDir, logger = console, spawnImpl = spawn } = {}) {
  let state = { status:'idle', startedAt:null, finishedAt:null, exitCode:null, error:null };
  let child = null;
  let retryTimer = null;
  async function pendingCount() {
    try { return JSON.parse(await readFile(join(dataDir, 'history-queue.json'), 'utf8')).pending?.length ?? 0; }
    catch { return 0; }
  }
  function scheduleNext(api, remaining) {
    if (!remaining || process.env.AUTO_SCAN_BATCHES === '0') return;
    const delay = Math.max(1000, Number(process.env.HISTORY_BATCH_DELAY_MS ?? 5000));
    logger.log(JSON.stringify({ event:'history_batch_scheduled', remaining, delayMs:delay }));
    retryTimer = setTimeout(() => { retryTimer = null; api.start(); }, delay);
  }
  const api = {
    state:() => ({ ...state }),
    start() {
      if (child) return false;
      state = { status:'running', startedAt:new Date().toISOString(), finishedAt:null, exitCode:null, error:null };
      logger.log(JSON.stringify({ event:'live_scan_started', dataDir }));
      child = spawnImpl(process.execPath, ['scripts/run-scan.mjs'], { cwd:root, env:{ ...process.env, DATA_DIR:dataDir }, stdio:['ignore','pipe','pipe'] });
      child.stdout?.on('data', chunk => logger.log(String(chunk).trim()));
      child.stderr?.on('data', chunk => logger.error(String(chunk).trim()));
      child.on('error', error => {
        state = { ...state, status:'failed', finishedAt:new Date().toISOString(), error:error.message };
        logger.error(JSON.stringify({ event:'live_scan_process_error', error:error.message }));
        child = null;
      });
      child.on('exit', async code => {
        state = { ...state, status:code === 0 ? 'complete' : 'failed', finishedAt:new Date().toISOString(), exitCode:code, error:code === 0 ? null : `Scan exited with code ${code}` };
        logger[code === 0 ? 'log' : 'error'](JSON.stringify({ event:'live_scan_finished', exitCode:code }));
        child = null;
        if (code === 0) scheduleNext(api, await pendingCount());
      });
      return true;
    }
  };
  return api;
}
