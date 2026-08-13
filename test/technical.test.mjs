import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTechnical, deriveWeeklyTechnical, sma, rsi } from '../src/technical.mjs';

const bars = Array.from({ length: 320 }, (_, i) => ({ close: 100 + i * .2 + (i % 4), low: 98 + i * .2, volume: 1000 - i * 2 }));

test('均線與RSI可計算', () => {
  assert.equal(sma([1,2,3,4,5], 3), 4);
  assert.ok(rsi(bars.map(x => x.close)) >= 0 && rsi(bars.map(x => x.close)) <= 100);
});
test('技術結構會產生支撐與交易訊號', () => {
  const result = deriveTechnical(bars);
  assert.equal(result.complete, true);
  assert.ok(result.ma20 > 0);
  assert.ok(result.support > 0);
  assert.equal(typeof result.nearSupport, 'boolean');
});
test('K線不足時不硬算', () => {
  assert.equal(deriveTechnical(bars.slice(0, 119)).complete, false);
  assert.equal(deriveTechnical(bars.slice(0, 120)).complete, true);
});
test('週線不足60根時不硬算', () => {
  assert.equal(deriveTechnical(bars.slice(0, 299)).complete, true);
  assert.equal(deriveWeeklyTechnical(bars.slice(0, 299)).complete, false);
  assert.equal(deriveWeeklyTechnical(bars.slice(0, 300)).complete, true);
});
