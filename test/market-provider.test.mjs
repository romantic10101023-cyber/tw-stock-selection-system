import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketIndex } from '../src/market-provider.mjs';

test('市場指數與漲跌家數欄位可解析', () => {
  const result = parseMarketIndex([{ 指數名稱:'發行量加權股價指數', 收盤指數:'21,234.56', 上漲家數:'700', 下跌家數:'300' }]);
  assert.equal(result.close, 21234.56);
  assert.equal(result.advancers, 700);
  assert.equal(result.decliners, 300);
});
