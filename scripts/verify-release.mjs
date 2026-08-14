import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseGate } from '../src/release-gate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const requiredFiles = ['Dockerfile', '.env.example', 'config/schedule.json', 'docs/deployment.md', 'docs/production-checklist.md', 'src/price-history-provider.mjs', 'src/tpex-history-provider.mjs', 'src/batch-state.mjs', 'src/batch-worker.mjs', 'src/scan-coordinator.mjs', 'src/production-batch.mjs', 'src/api-contract.mjs', 'scripts/scan-batch.js', 'test/batch-worker.test.mjs', 'test/production-api.test.mjs'];
const missing = [];
for (const file of requiredFiles) { try { await readFile(join(root, file)); } catch { missing.push(file); } }
const schedule = JSON.parse(await readFile(join(root, 'config/schedule.json'), 'utf8'));
const sample = { provider: 'live', validation: { ok: true }, coverage: { total: 1, dailyBars: 1, weeklyBars: 1, eligible: 1 }, scoredIneligible:0, factorSources: { revenue: { ok: true }, income: { ok: true }, pe: { ok: true }, margin: { ok: true }, institutions: { ok: true } } };
const checks = { requiredFiles: missing.length === 0, schedule: schedule.timezone === 'Asia/Taipei' && schedule.dailyScan === '23:30', bars: schedule.minDailyBars >= 120 && schedule.minWeeklyBars >= 60, releaseGate: releaseGate(sample, { officialRequired: true }).publish };
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, missing }, null, 2));
if (!ok) process.exitCode = 1;
