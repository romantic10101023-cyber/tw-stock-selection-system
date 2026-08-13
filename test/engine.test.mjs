import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLists, analyze, tradability } from '../src/engine.mjs';
import { demoStocks } from '../src/demo-data.mjs';

test('排除低價與非普通股', () => {
  assert.equal(tradability({...demoStocks[0], price: 20}).ok, false);
  assert.equal(tradability({...demoStocks[0], tags:['ETF']}).ok, false);
});
test('排名與分組可重現', () => {
  const result = buildLists(demoStocks);
  assert.equal(result.ranked.length, 5);
  assert.ok(result.ranked[0].total >= result.ranked.at(-1).total);
  assert.ok(result.top12.every(x => x.total >= 60));
});
test('估值陷阱不能成為核心推薦', () => {
  const x = analyze({...demoStocks[0], valuationTrap:true});
  assert.equal(x.valuation.label, '估值陷阱');
  assert.notEqual(x.status, '可布局');
});
test('沒有預先提供合理價時，模型會用EPS與正常化PE估算', () => {
  const x = analyze({...demoStocks[0], fairValue:0, normalPe:20});
  assert.equal(x.valuation.fairValue, 68);
  assert.equal(x.valuation.label, '偏貴');
});
