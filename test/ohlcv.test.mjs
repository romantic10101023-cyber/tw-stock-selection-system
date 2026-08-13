import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBars, normalizeBar, validateBars } from '../src/ohlcv.mjs';

test('OHLCV可標準化與驗證', () => {
  const bar = normalizeBar({ 日期:'2026-08-13', 開盤價:'80', 最高價:'84', 最低價:'79', 收盤價:'82', 成交量:'1,200' });
  assert.equal(validateBars([bar], '2026-08-13').ok, true);
  assert.equal(bar.volume, 1200);
});
test('K線合併以日期去重', () => {
  const result = mergeBars([{date:'2026-08-12', close:80}], [{date:'2026-08-12', close:82}, {date:'2026-08-13', close:83}]);
  assert.equal(result.length, 2);
  assert.equal(result[0].close, 82);
});
