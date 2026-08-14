import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const BATCH_SIZE = 10;
export const LEASE_MS = 15 * 60 * 1000;
export const RETRY_DELAYS_MS = [30_000, 90_000, 180_000];
export const statePaths = dataDir => ({ universe:join(dataDir,'universe.json'), queue:join(dataDir,'queue.json'), checkpoint:join(dataDir,'checkpoint.json'), results:join(dataDir,'results.json'), failures:join(dataDir,'failures.json'), lock:join(dataDir,'worker-lock.json') });

export async function readJson(path, fallback) { try { return JSON.parse(await readFile(path,'utf8')); } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return fallback; throw error; } }
export async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive:true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, path);
}
export async function persistenceStatus(dataDir) {
  const configured = Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.PERSISTENT_STORAGE === '1');
  try { await mkdir(dataDir,{recursive:true}); const marker=join(dataDir,'.persistence-check'); await writeFile(marker,new Date().toISOString()); await stat(marker); return configured ? 'configured' : 'not_configured'; }
  catch { return 'unavailable'; }
}

export async function acquireLease(path, now = new Date(), leaseMs = LEASE_MS) {
  await mkdir(dirname(path), { recursive:true });
  const payload = { pid:process.pid, acquiredAt:now.toISOString(), expiresAt:new Date(now.getTime()+leaseMs).toISOString() };
  try { const handle=await open(path,'wx'); await handle.writeFile(JSON.stringify(payload,null,2)); await handle.close(); return { acquired:true, staleTakenOver:false, payload }; }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const current = await readJson(path, null);
    if (current && new Date(current.expiresAt).getTime() > now.getTime()) return { acquired:false, staleTakenOver:false, payload:current };
    try { await unlink(path); } catch (unlinkError) { if (unlinkError.code !== 'ENOENT') return { acquired:false, staleTakenOver:false, payload:current }; }
    const takeover = await acquireLease(path, now, leaseMs); return { ...takeover, staleTakenOver:takeover.acquired };
  }
}
export async function releaseLease(path) { try { await unlink(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }

export function createQueue(stocks, previous = []) {
  const previousByCode = new Map(previous.map(item=>[item.code,item]));
  return stocks.map(stock => previousByCode.get(stock.code) ?? { code:stock.code, market:stock.market, name:stock.name, status:'pending', attempts:0, nextAttemptAt:null, startedAt:null, finishedAt:null, lastError:null, dailyBars:0, weeklyBars:0 });
}
export function recoverStaleRunning(queue, now = new Date(), leaseMs = LEASE_MS) {
  return queue.map(item => item.status === 'running' && now.getTime()-new Date(item.startedAt).getTime()>leaseMs ? { ...item,status:'retryable',startedAt:null,nextAttemptAt:now.toISOString(),lastError:item.lastError ?? 'running lease expired' } : item);
}
export function claimBatch(queue, batchSize=BATCH_SIZE, now=new Date()) {
  const eligible=queue.filter(item=>item.status==='pending'||(item.status==='retryable'&&(!item.nextAttemptAt||new Date(item.nextAttemptAt)<=now))).slice(0,batchSize);
  const claimed=new Set(eligible.map(item=>item.code));
  return { batch:eligible, queue:queue.map(item=>claimed.has(item.code)?{...item,status:'running',startedAt:now.toISOString()}:item) };
}
export function completeItem(item, outcome, now=new Date()) {
  if (outcome.success) return { ...item,status:'success',finishedAt:now.toISOString(),startedAt:null,lastError:null,dailyBars:outcome.dailyBars,weeklyBars:outcome.weeklyBars };
  const attempts=(item.attempts??0)+1;
  if (attempts>=3) return { ...item,status:'dead-letter',attempts,finishedAt:now.toISOString(),startedAt:null,lastError:outcome.error,dailyBars:outcome.dailyBars??0,weeklyBars:outcome.weeklyBars??0 };
  return { ...item,status:'retryable',attempts,startedAt:null,lastError:outcome.error,nextAttemptAt:new Date(now.getTime()+RETRY_DELAYS_MS[attempts-1]).toISOString(),dailyBars:outcome.dailyBars??0,weeklyBars:outcome.weeklyBars??0 };
}
export function queueSummary(queue) {
  const count=status=>queue.filter(item=>item.status===status).length;
  return { total:queue.length,processed:count('success')+count('dead-letter'),remaining:count('pending')+count('running')+count('retryable'),successCount:count('success'),failedCount:count('retryable')+count('dead-letter'),retryCount:count('retryable'),retryableCount:count('retryable'),deadLetterCount:count('dead-letter'),dailyCoverageCount:queue.filter(item=>item.dailyBars>=120).length,weeklyCoverageCount:queue.filter(item=>item.weeklyBars>=60).length };
}
