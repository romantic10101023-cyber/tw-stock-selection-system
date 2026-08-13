import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichStock } from '../src/enrich.mjs';

test('財報與籌碼因子會覆蓋舊快取欄位並送入模型', () => {
  const result = enrichStock({ code:'2408', eps4q:1, pe:30, foreign20:0, margin20:100 }, {
    income:{ eps:3.4, grossMargin:28, source:'live' },
    valuation:{ pe:18.2, source:'live' },
    chips:{ foreignNet:42000, marginChange:-50, source:'live' }
  });
  assert.equal(result.eps4q, 3.4);
  assert.equal(result.pe, 18.2);
  assert.equal(result.foreign20, 42000);
  assert.equal(result.margin20, -50);
  assert.equal(result.factorSource, 'live');
});
