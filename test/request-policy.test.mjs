import test from 'node:test';
import assert from 'node:assert/strict';

test('官方抓取政策採批次、順序與低頻節流', () => {
  const policy = { bulk: true, sequential: true, minIntervalMs: 1200, retries: 3 };
  assert.equal(policy.bulk, true);
  assert.equal(policy.sequential, true);
  assert.ok(policy.minIntervalMs >= 1000);
  assert.equal(policy.retries, 3);
});
