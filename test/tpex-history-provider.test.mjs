import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTpexHistory } from '../src/tpex-history-provider.mjs';

test('real TPEx official JSON schema is normalized into OHLCV bars', () => {
  const payload = {
    stat:'ok', date:'20260801',
    tables:[{ fields:['日 期','成交張數','成交仟元','開盤','最高','最低','收盤','漲跌','筆數'], data:[['115/08/03','15,388','13,694,380','870.00','930.00','843.00','866.00','11.00','23,455']] }]
  };
  assert.deepEqual(parseTpexHistory(payload, { code:'6488', asOf:'2026-08-13', logger:{error() {}} }), [{ date:'2026-08-03', open:870, high:930, low:843, close:866, volume:15388 }]);
});

test('one malformed TPEx row does not discard valid rows', () => {
  const payload = { stat:'ok', tables:[{ fields:['日 期','成交張數','成交仟元','開盤','最高','最低','收盤','漲跌','筆數'], data:[
    ['115/08/03','15,388','13,694,380','870.00','930.00','843.00','866.00','11.00','23,455'],
    ['115/08/04','0','0','--','--','--',null,'--','0']
  ] }] };
  assert.equal(parseTpexHistory(payload, { code:'6488', asOf:'2026-08-13', logger:{error() {}} }).length, 1);
});
