import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWeeklyBars, deriveTechnical, deriveWeeklyTechnical, sma, rsi } from '../src/technical.mjs';

function tradingBars(count, start = '2024-01-01') {
  const bars = [], date = new Date(`${start}T00:00:00Z`);
  while (bars.length < count) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      const i = bars.length;
      bars.push({ date:date.toISOString().slice(0, 10), open:100+i*.1, high:102+i*.1, low:98+i*.1, close:101+i*.1, volume:1000+i });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return bars;
}

test('moving average and RSI are calculated', () => {
  const bars = tradingBars(320);
  assert.equal(sma([1,2,3,4,5], 3), 4);
  assert.ok(rsi(bars.map(bar => bar.close)) >= 0);
});

test('daily bars below 120 are blocked', () => {
  assert.equal(deriveTechnical(tradingBars(119)).complete, false);
  assert.equal(deriveTechnical(tradingBars(120)).complete, true);
});

test('weekly bars are aggregated by calendar week with correct OHLCV', () => {
  const weeks = aggregateWeeklyBars(tradingBars(10));
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].open, 100);
  assert.equal(weeks[0].close, 101.4);
  assert.equal(weeks[0].high, 102.4);
  assert.equal(weeks[0].low, 98);
  assert.equal(weeks[0].volume, 5010);
});

test('weekly bars below 60 are blocked and 60 are accepted', () => {
  assert.equal(deriveWeeklyTechnical(tradingBars(295)).complete, false);
  assert.equal(deriveWeeklyTechnical(tradingBars(300)).complete, true);
});

export { tradingBars };
