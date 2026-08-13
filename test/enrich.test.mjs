import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichStock } from '../src/enrich.mjs';

test('enrichment preserves official semantics and reports unavailable aggregates', () => {
  const result = enrichStock({ code:'2408' }, { revenue:{ revenueYoY:18, source:'live' }, income:{ reportedEps:3.4, source:'live' }, valuation:{ pe:18.2 }, chips:{ foreignNetDaily:42000, marginBalanceChangeDaily:-50 } });
  assert.equal(result.reportedEps, 3.4);
  assert.equal(result.revenueYoY, 18);
  assert.equal(result.foreignNetDaily, 42000);
  assert.equal(result.marginBalanceChangeDaily, -50);
  assert.equal(result.factorAvailability.foreign20.available, false);
  assert.equal(result.foreign20, undefined);
});
