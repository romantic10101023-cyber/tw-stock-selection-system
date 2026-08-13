import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOutcomes } from '../src/outcome.mjs';

test('績效摘要可計算命中率與平均報酬', () => {
  const result = summarizeOutcomes([
    { status:'tp1', returnPct:10, days:4 },
    { status:'stop', returnPct:-8, days:2 },
    { status:'open', days:5 }
  ]);
  assert.equal(result.total, 3);
  assert.equal(result.hitRate, .5);
  assert.equal(result.averageReturnPct, 1);
  assert.equal(result.averageDays, 11 / 3);
});
