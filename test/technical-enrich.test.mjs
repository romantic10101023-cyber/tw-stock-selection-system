import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTechnical } from '../src/technical-enrich.mjs';

const bars = Array.from({ length: 320 }, (_, i) => ({ close:100+i*.1, open:99+i*.1, high:101+i*.1, low:98+i*.1, volume:1000+i }));

test('歷史K線會覆蓋技術欄位與支撐停損', () => {
  const result = applyTechnical({ code:'2408', technical:{} }, bars);
  assert.equal(result.technicalSource, 'live');
  assert.ok(result.support > 0);
  assert.ok(result.stop < result.support);
});
test('K線不足時標示資料不足', () => {
  assert.equal(applyTechnical({ code:'2408' }, bars.slice(0, 119)).technicalSource, 'missing');
});
