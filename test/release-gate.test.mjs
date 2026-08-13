import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseGate } from '../src/release-gate.mjs';

test('正式資料與K線完整時才允許發布', () => {
  const base = { provider:'live', validation:{ok:true}, coverage:{total:10, dailyBars:10, weeklyBars:10} };
  assert.equal(releaseGate(base).publish, true);
  assert.equal(releaseGate({...base, provider:'demo'}).publish, false);
  assert.equal(releaseGate({...base, coverage:{total:10, dailyBars:9, weeklyBars:10}}).publish, false);
});
