import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFactors, parseIncome, parseInstitutions, parseMargin, parsePe, parseRevenue } from '../src/factor-provider.mjs';

test('財報、估值與籌碼欄位可以按代號合併', () => {
  const factors = mergeFactors(
    parseRevenue([{公司代號:'2408', '去年同月增減(%)':'18'}]),
    parseIncome([{公司代號:'2408', '基本每股盈餘（元）':'3.4'}]),
    parsePe([{證券代號:'2408', 本益比:'18.2'}]),
    parseMargin([{證券代號:'2408', 融資餘額:'1000', 融資餘額增減:'-50'}]),
    parseInstitutions([{證券代號:'2408', '外資及陸資買賣超股數':'42000'}])
  );
  assert.equal(factors['2408'].revenueYoY, 18);
  assert.equal(factors['2408'].eps, 3.4);
  assert.equal(factors['2408'].pe, 18.2);
  assert.equal(factors['2408'].marginChange, -50);
  assert.equal(factors['2408'].foreignNet, 42000);
});
