import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageReport } from '../src/data-coverage.mjs';

test('資料覆蓋率會分模組統計', () => {
  const report = coverageReport([
    { price:80, eps4q:3, revenueGrowth4q:10, pe:15, fairValue:100, foreign20:1, margin20:-1, technicalSource:'live', weeklyTechnical:{complete:true} },
    { price:50, eps4q:null, revenueGrowth4q:null, technicalSource:'missing' }
  ]);
  assert.equal(report.total, 2);
  assert.equal(report.dailyBars, 1);
  assert.equal(report.percent.dailyBars, 50);
  assert.equal(report.ok, false);
});
