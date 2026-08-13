import test from 'node:test';
import assert from 'node:assert/strict';
import { historyInputs } from '../src/market-history.mjs';

test('市場歷史資料可轉換成模式判斷輸入', () => {
  const result = historyInputs([{ date:'2026-08-12', close:21000, advancers:700, decliners:300 }]);
  assert.deepEqual(result.indexCloses, [21000]);
  assert.deepEqual(result.breadth, { advancers:700, decliners:300 });
});
