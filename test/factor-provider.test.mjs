import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFactors, parseIncome, parseInstitutions, parseMargin, parsePe, parseRevenue } from '../src/factor-provider.mjs';

test('parses representative official TWSE and TPEX factor schemas without inventing 20-day values', () => {
  const factors = mergeFactors(
    parseRevenue([{ 公司代號:'2330', '營業收入-當月營收':'323,166,000', '營業收入-去年同月增減(%)':'44.68' }]),
    parseIncome([{ SecuritiesCompanyCode:'2330', '基本每股盈餘（元）':'19.50', 年季:'11502' }]),
    parsePe([{ Code:'2330', PEratio:'24.30' }]),
    parseMargin([{ 證券代號:'2330', 融資前日餘額:'29,070', 融資今日餘額:'28,604' }]),
    parseInstitutions([{ SecuritiesCompanyCode:'6488', '外資及陸資買賣超股數':'42,000' }])
  );
  assert.equal(factors['2330'].revenueYoY, 44.68);
  assert.equal(factors['2330'].reportedEps, 19.5);
  assert.equal(factors['2330'].pe, 24.3);
  assert.equal(factors['2330'].marginBalanceChangeDaily, -466);
  assert.equal(factors['2330'].margin20, undefined);
  assert.equal(factors['6488'].foreignNetDaily, 42000);
  assert.equal(factors['6488'].foreign20, undefined);
});
