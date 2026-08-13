import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFactors, parseIncome, parsePe } from '../src/factor-provider.mjs';

test('官方因子資料可組成單一股票因子集合', () => {
  const income = parseIncome([{公司代號:'2408', '基本每股盈餘（元）':'3.4'}]);
  const pe = parsePe([{證券代號:'2408', 本益比:'18.2'}]);
  const result = mergeFactors(income, pe);
  assert.equal(result['2408'].eps, 3.4);
  assert.equal(result['2408'].pe, 18.2);
});
