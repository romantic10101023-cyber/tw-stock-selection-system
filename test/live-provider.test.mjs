import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStock } from '../src/data-model.mjs';

test('官方行情資料的數字格式可被標準化', () => {
  const stock = normalizeStock({ code: '2330', price: Number('1,234'.replace(',', '')), volume5: 2200, source: 'live' });
  assert.equal(stock.code, '2330');
  assert.equal(stock.price, 1234);
  assert.equal(stock.volume5, 2200);
});
