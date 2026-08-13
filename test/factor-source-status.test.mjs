import test from 'node:test';
import assert from 'node:assert/strict';

test('因子來源狀態可逐來源記錄', () => {
  const status = { revenue:{ok:true,rows:100,error:null}, pe:{ok:false,rows:0,error:'502'} };
  assert.equal(status.revenue.ok, true);
  assert.equal(status.pe.ok, false);
  assert.equal(status.pe.error, '502');
});
