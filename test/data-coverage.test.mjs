import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageReport, partitionByCoverage, scoringEligibility } from '../src/data-coverage.mjs';

const complete = { code:'2330', name:'TSMC', market:'twse', price:800, reportedEps:30, revenueYoY:20, volume5:5000, dailyBars:300, weeklyBars:60, technical:{complete:true}, weeklyTechnical:{complete:true} };
test('daily history below 120 is blocked', () => assert.match(scoringEligibility({ ...complete, dailyBars:119 }).reasons.join(' '), /日線不足/));
test('weekly history below 60 is blocked', () => assert.match(scoringEligibility({ ...complete, weeklyBars:59 }).reasons.join(' '), /週線不足/));
test('complete official core data can enter scoring without fabricated 20-day chips', () => assert.equal(scoringEligibility(complete).eligible, true));
test('missing fundamentals are grouped accurately and cannot generate eligibility', () => {
  const missing = { ...complete, code:'2317', reportedEps:undefined };
  const partition = partitionByCoverage([complete, missing]);
  const report = coverageReport([...partition.eligible, ...partition.insufficient]);
  assert.equal(partition.eligible.length, 1);
  assert.equal(report.missingFundamentalFields.reportedEps, 1);
  assert.equal(report.missingFundamentalFields.revenueYoY, 0);
});
