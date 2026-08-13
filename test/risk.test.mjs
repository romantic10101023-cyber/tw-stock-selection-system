import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTradePlan } from '../src/risk.mjs';

test('交易計畫可計算股數、投入與最大損失', () => {
  const plan = buildTradePlan({ price:82, stop:74, tp1:98, capital:40000 });
  assert.equal(plan.shares, 487);
  assert.equal(Math.round(plan.invested), 39934);
  assert.equal(Math.round(plan.maxLoss), 3896);
  assert.ok(plan.rewardRisk > 1.5);
});
test('停損高於進場價時拒絕計算', () => {
  assert.equal(buildTradePlan({ price:82, stop:90, tp1:98 }).valid, false);
});
