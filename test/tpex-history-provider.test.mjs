import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTpexHistory } from '../src/tpex-history-provider.mjs';

test('TPEx official JSON rows are normalized into OHLCV bars', () => {
  const payload = { stat:'ok', tables:[{ data:[['115/08/13','1,200','100,000','80','84','79','82','+2','500']] }] };
  assert.deepEqual(parseTpexHistory(payload), [{ date:'2026-08-13', open:80, high:84, low:79, close:82, volume:1200 }]);
});
