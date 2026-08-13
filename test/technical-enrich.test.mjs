import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTechnical } from '../src/technical-enrich.mjs';

function tradingBars(count) {
  const bars = [], date = new Date('2024-01-01T00:00:00Z');
  while (bars.length < count) {
    if (![0,6].includes(date.getUTCDay())) {
      const i = bars.length;
      bars.push({ date:date.toISOString().slice(0,10), open:99+i*.1, high:101+i*.1, low:98+i*.1, close:100+i*.1, volume:1000+i });
    }
    date.setUTCDate(date.getUTCDate()+1);
  }
  return bars;
}

test('complete daily and weekly history enters technical scoring', () => {
  const result = applyTechnical({ code:'2408' }, tradingBars(300), { source:'live' });
  assert.equal(result.technicalSource, 'live');
  assert.equal(result.dailyBars, 300);
  assert.equal(result.weeklyBars, 60);
  assert.equal(result.historyStatus, 'complete');
});

test('120 daily bars with fewer than 60 weekly bars remain insufficient', () => {
  const result = applyTechnical({ code:'2408' }, tradingBars(120), { source:'live' });
  assert.equal(result.technicalSource, 'missing');
  assert.equal(result.dailyBars, 120);
  assert.equal(result.weeklyBars, 24);
  assert.match(result.technical.reason, /週線不足/);
});
