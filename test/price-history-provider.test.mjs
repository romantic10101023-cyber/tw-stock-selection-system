import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBar, validateBars } from '../src/ohlcv.mjs';

test('歷史行情欄位可供技術引擎使用', () => {
  const bars = [normalizeBar({ date:'2026-08-13', open:'80', high:'84', low:'79', close:'82', volume:'1200' })];
  assert.equal(validateBars(bars, '2026-08-13').ok, true);
  assert.equal(typeof bars[0].close, 'number');
});
