import test from 'node:test';
import assert from 'node:assert/strict';
import { filterUniverse } from '../src/universe.mjs';

test('股票池排除規則集中管理', () => {
  const result = filterUniverse([
    { code:'2330', name:'台積電', price:900, volume5:5000, tags:[] },
    { code:'0050', name:'ETF', price:100, volume5:5000, tags:['ETF'] },
    { code:'1234', name:'低價股', price:20, volume5:5000, tags:[] }
  ]);
  assert.equal(result.counts.included, 1);
  assert.equal(result.counts.excluded, 2);
  assert.equal(result.excluded[0].exclusionReason, '排除類別：ETF');
});
