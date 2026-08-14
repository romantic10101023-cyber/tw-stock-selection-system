import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseGate } from '../src/release-gate.mjs';

test('正式資料與K線完整時才允許發布', () => {
  const base = { provider:'live', validation:{ok:true}, coverage:{total:10, dailyBars:10, weeklyBars:10, eligible:10}, scoredIneligible:0 };
  assert.equal(releaseGate(base).publish, true);
  assert.equal(releaseGate({...base, provider:'demo'}).publish, false);
  assert.equal(releaseGate({...base, coverage:{total:10, dailyBars:9, weeklyBars:10, eligible:9}}).publish, true);
  assert.equal(releaseGate({...base, coverage:{total:10, dailyBars:0, weeklyBars:0, eligible:0}}).publish, false);
  assert.equal(releaseGate({...base, scoredIneligible:1}).publish, false);
  assert.equal(releaseGate({...base, universe:{queueComplete:false}}).publish, false);
});
