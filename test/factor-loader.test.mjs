import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFactors, parseIncome, parsePe } from '../src/factor-provider.mjs';

test('official factor rows merge by stock code', () => {
  const income = parseIncome([{ 公司代號:'2408', '基本每股盈餘（元）':'3.4' }]);
  const pe = parsePe([{ Code:'2408', PEratio:'18.2' }]);
  const result = mergeFactors(income, pe);
  assert.equal(result['2408'].reportedEps, 3.4);
  assert.equal(result['2408'].pe, 18.2);
});
