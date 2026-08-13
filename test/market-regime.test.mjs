import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMarket } from '../src/market-regime.mjs';

test('市場環境可辨識多頭與空頭', () => {
  const bull = Array.from({ length: 60 }, (_, i) => 100 + i);
  const bear = Array.from({ length: 60 }, (_, i) => 200 - i);
  assert.equal(classifyMarket({ indexCloses: bull, breadth:{advancers:700, decliners:300} }).mode, 'bull');
  assert.equal(classifyMarket({ indexCloses: bear, breadth:{advancers:200, decliners:800} }).mode, 'bear');
});
test('市場資料不足時採震盪模式', () => {
  assert.equal(classifyMarket({ indexCloses:[1,2,3] }).mode, 'range');
});
