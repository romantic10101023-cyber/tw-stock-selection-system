import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTwseHistory } from '../src/price-history-provider.mjs';
import { applyTechnical } from '../src/technical-enrich.mjs';
import { partitionByCoverage } from '../src/data-coverage.mjs';

test('official API failure cannot create a false recommendation', async () => {
  const history = await loadTwseHistory('2330', '2026-08-13', {
    months:1,
    fetchJson:async () => { throw new Error('offline'); },
    logger:{ error() {} }
  });
  assert.equal(history.bars.length, 0);
  assert.equal(history.errors.length, 1);
  const stock = applyTechnical({ code:'2330', price:800, eps4q:30, revenueGrowth4q:20, volume5:5000, foreign20:1, margin20:-1 }, history.bars, { source:'live' });
  const partition = partitionByCoverage([stock]);
  assert.equal(partition.eligible.length, 0);
  assert.equal(partition.insufficient.length, 1);
});
