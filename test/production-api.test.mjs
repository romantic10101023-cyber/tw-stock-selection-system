import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server.mjs';
import { API_ROUTES } from '../src/api-contract.mjs';

async function withServer(t, setup) {
  const dataDir = await mkdtemp(join(tmpdir(), 'tw-stock-api-'));
  const runner = { state:() => ({ status:'running', startedAt:'2026-08-13T00:00:00Z' }) };
  const server = createApp({ dataDir, runner, logger:{ log() {}, error() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive:true, force:true }); });
  return setup({ base:`http://127.0.0.1:${server.address().port}`, dataDir });
}

test('scan route returns explicit JSON while official scan is pending', t => withServer(t, async ({ base }) => {
  const response = await fetch(`${base}${API_ROUTES.scan}`);
  assert.equal(response.status, 202);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'LIVE_SCAN_PENDING');
}));

test('successful scan route returns the production response contract', t => withServer(t, async ({ base, dataDir }) => {
  const scan = { asOf:'2026-08-13', runAt:new Date().toISOString(), provider:'live', validation:{ok:true}, coverage:{total:2,dailyBars:2,weeklyBars:1,eligible:1,details:[]}, historyDiagnostics:{validDailyCount:2,validWeeklyCount:1,insufficientByReason:{'週線不足':1}}, insufficientData:[{code:'2317',dailyBars:300,weeklyBars:59}], ranked:[{code:'2330'}], top3:[{code:'2330'}], top12:[{code:'2330'}], watch:[], release:{publish:true,failures:[]}, marketMode:'bull' };
  await writeFile(join(dataDir, 'latest-scan.json'), JSON.stringify(scan));
  const response = await fetch(`${base}${API_ROUTES.scan}`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.dataSource, 'live');
  assert.equal(body.candidateCount, 2);
  assert.equal(body.dailyCoverageCount, 2);
  assert.equal(body.weeklyCoverageCount, 1);
  assert.equal(body.insufficientData[0].code, '2317');
  assert.equal(body.recommendations.top3[0].code, '2330');
  assert.equal(body.historyDiagnostics.validDailyCount, 2);
  const coverageResponse = await fetch(`${base}${API_ROUTES.coverage}`);
  assert.equal(coverageResponse.status, 200);
  const coverage = await coverageResponse.json();
  assert.equal(coverage.dailyCoverageCount, 2);
  assert.equal(coverage.weeklyCoverageCount, 1);
  assert.deepEqual(coverage.insufficientByReason, {'週線不足':1});
}));

test('health, coverage and unknown API routes always return JSON', t => withServer(t, async ({ base }) => {
  for (const [path, status] of [[API_ROUTES.health,200],[API_ROUTES.coverage,503],['/api/missing',404]]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const text = await response.text();
    assert.doesNotThrow(() => JSON.parse(text));
  }
}));

test('frontend scan path matches the backend route contract', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const path = source.match(/const SCAN_API_PATH = '([^']+)'/)?.[1];
  assert.equal(path, API_ROUTES.scan);
  assert.doesNotMatch(source, /localhost|127\.0\.0\.1/);
});

test('health exposes persistent worker progress', t => withServer(t, async ({ base, dataDir }) => {
  await writeFile(join(dataDir, 'checkpoint.json'), JSON.stringify({ total:100, processed:1, remaining:1, currentBatch:2, lastProgressAt:'2026-08-14T00:00:00Z' }));
  await writeFile(join(dataDir, 'worker-lock.json'), JSON.stringify({ pid:123, acquiredAt:'2026-08-14T00:00:00Z' }));
  const response = await fetch(`${base}${API_ROUTES.health}`);
  const body = await response.json();
  assert.equal(body.scan.processed, 1);
  assert.equal(body.scan.remaining, 1);
  assert.equal(body.scan.currentBatch, 2);
  assert.equal(body.scan.lockStatus, 'locked');
}));
