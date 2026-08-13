import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireScanLock, releaseScanLock } from '../src/scan-lock.mjs';

test('掃描鎖可避免重複執行並可釋放', async () => {
  const path = join(tmpdir(), `tw-stock-lock-${process.pid}.json`);
  await releaseScanLock(path);
  assert.equal(await acquireScanLock(path), true);
  assert.equal(await acquireScanLock(path), false);
  await releaseScanLock(path);
  assert.equal(await acquireScanLock(path), true);
  await releaseScanLock(path);
});
