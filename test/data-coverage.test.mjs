import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageReport, partitionByCoverage, scoringEligibility } from '../src/data-coverage.mjs';

const complete = { code:'2330', name:'TSMC', market:'twse', price:800, eps4q:30, revenueGrowth4q:20, volume5:5000, foreign20:1, margin20:-1, dailyBars:300, weeklyBars:60, technical:{complete:true}, weeklyTechnical:{complete:true} };

test('daily history below 120 is blocked', () => {
  const result = scoringEligibility({ ...complete, dailyBars:119 });
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join(' '), /日線不足/);
});

test('weekly history below 60 is blocked', () => {
  const result = scoringEligibility({ ...complete, weeklyBars:59 });
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join(' '), /週線不足/);
});

test('complete daily, weekly and fundamental data can enter scoring', () => {
  assert.equal(scoringEligibility(complete).eligible, true);
  const partition = partitionByCoverage([complete, { ...complete, code:'2317', weeklyBars:59 }]);
  assert.equal(partition.eligible.length, 1);
  assert.equal(partition.insufficient.length, 1);
  const report = coverageReport(partition.eligible.concat(partition.insufficient));
  assert.equal(report.details[0].dailyBars, 300);
  assert.equal(report.eligible, 1);
});
