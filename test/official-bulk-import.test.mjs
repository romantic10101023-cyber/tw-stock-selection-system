import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTwseBulk, parseTpexBulk } from '../src/official-bulk-import.mjs';

test('TWSE free daily market batch normalizes official OHLCV and skips malformed rows',()=>{const fields=['證券代號','證券名稱','成交股數','開盤價','最高價','最低價','收盤價'],payload={tables:[{fields,data:[['2330','台積電','1,234,567','1,000','1,020','995','1,015'],['2317','鴻海','--','--','--','--','--']]}]};const bars=parseTwseBulk(payload,'2026-08-13');assert.equal(bars.length,1);assert.deepEqual(bars[0],{code:'2330',date:'2026-08-13',open:1000,high:1020,low:995,close:1015,volume:1234567});});

test('TPEX free daily market batch accepts numeric strings and rejects only bad rows',()=>{const fields=['代號','名稱','收盤','開盤','最高','最低','成交股數'],payload={tables:[{fields,data:[['6488','環球晶','500.5','490','505','488','2,000'],['0000','bad',null,'1','2','1','1']]}]};const bars=parseTpexBulk(payload,'2026-08-13');assert.equal(bars.length,1);assert.equal(bars[0].code,'6488');assert.equal(bars[0].close,500.5);});
