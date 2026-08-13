import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStock, validateBatch, SOURCE_STATUS } from '../src/data-model.mjs';
import { createProvider } from '../src/provider.mjs';

test('資料標準化與批次驗證', () => {
  const stock = normalizeStock({ code: 2408, name: '測試', source: SOURCE_STATUS.DEMO, dataDate: '2026-08-12' });
  assert.equal(stock.code, '2408');
  assert.equal(validateBatch([stock], '2026-08-12').ok, true);
  assert.equal(validateBatch([stock, stock], '2026-08-12').ok, false);
});

test('正式資料失敗時會降級到快取，再降級到示範資料', async () => {
  const provider = createProvider({ liveLoader: async () => { throw new Error('offline'); }, demoLoader: async () => [{ code: '1234' }] });
  const result = await provider.load('2026-08-12');
  assert.equal(result.status, SOURCE_STATUS.DEMO);
  assert.equal(result.stocks[0].code, '1234');
});
