import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_MONTHS, historyRequestMonths } from '../src/price-history-provider.mjs';

test('歷史K線請求會回溯至少18個月', () => {
  const months = historyRequestMonths('2026-08-13');
  assert.equal(months.length, HISTORY_MONTHS);
  assert.deepEqual(months.at(-1), { year:2026, month:8 });
  assert.ok(months.at(0).year <= 2025);
});
