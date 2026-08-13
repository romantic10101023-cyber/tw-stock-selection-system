import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBars, normalizeBar, normalizeOfficialRows, parseOfficialNumber, validateBars } from '../src/ohlcv.mjs';

test('official numeric strings and commas are normalized without treating missing values as zero', () => {
  assert.equal(parseOfficialNumber('2,435.00'), 2435);
  assert.equal(parseOfficialNumber(' 1,200 '), 1200);
  assert.equal(parseOfficialNumber('--'), null);
  assert.equal(parseOfficialNumber(''), null);
  assert.equal(parseOfficialNumber(null), null);
  assert.equal(normalizeBar({ date:'2026-08-13', open:'80', high:'84', low:'79', close:'82', volume:'1,200' }).volume, 1200);
});

test('real TWSE response fields normalize valid rows and reject only malformed OHLC rows', () => {
  const logs = [];
  const payload = {
    fields:['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價','漲跌價差','成交筆數','註記'],
    data:[
      ['115/08/03','35,209,944','83,673,350,698','2,390.00','2,395.00','2,365.00','2,370.00','-55.00','174,489',''],
      ['115/08/04','0','0','--','--','--','--','--','0','停牌']
    ]
  };
  const result = normalizeOfficialRows({ rows:payload.data, fields:payload.fields, code:'2330', market:'twse', asOf:'2026-08-13', dateParser:value => value === '115/08/03' ? '2026-08-03' : '2026-08-04', logger:{error:value => logs.push(JSON.parse(value))} });
  assert.deepEqual(result.bars[0], { date:'2026-08-03', open:2390, high:2395, low:2365, close:2370, volume:35209944 });
  assert.equal(result.rejected.length, 1);
  assert.deepEqual(result.rejected[0].missingFields, ['open','high','low','close']);
  assert.equal(logs[0].code, '2330');
  assert.deepEqual(logs[0].missingFields, ['open','high','low','close']);
});

test('bar validation accepts numeric normalized values and merge de-duplicates dates', () => {
  const bar = normalizeBar({ date:'2026-08-13', open:'80', high:'84', low:'79', close:'82', volume:'1,200' });
  assert.equal(validateBars([bar], '2026-08-13').ok, true);
  const result = mergeBars([{date:'2026-08-12', close:80}], [{date:'2026-08-12', close:82}, {date:'2026-08-13', close:83}]);
  assert.equal(result.length, 2);
  assert.equal(result[0].close, 82);
});
