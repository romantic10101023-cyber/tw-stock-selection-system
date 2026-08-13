import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileCache } from '../src/cache-provider.mjs';

test('不存在快取時回傳空陣列，交由下一層 fallback', async () => {
  const cache = createFileCache('/tmp/tw-stock-cache-does-not-exist.json');
  assert.deepEqual(await cache('2026-08-13'), []);
});
