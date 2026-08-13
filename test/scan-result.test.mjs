import test from 'node:test';
import assert from 'node:assert/strict';
import { scanFreshness } from '../src/scan-result.mjs';

test('掃描結果新鮮度可判定', () => {
  const fresh = scanFreshness({ runAt:'2026-08-13T09:00:00Z' }, new Date('2026-08-13T18:00:00Z'));
  const stale = scanFreshness({ runAt:'2026-08-11T09:00:00Z' }, new Date('2026-08-13T18:00:00Z'));
  assert.equal(fresh.fresh, true);
  assert.equal(stale.fresh, false);
});
