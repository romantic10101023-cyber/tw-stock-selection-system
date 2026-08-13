import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrade, snapshotRecommendations } from '../src/outcome.mjs';

test('績效驗證可辨識停損與TP1', () => {
  assert.equal(evaluateTrade({ entry:100, stop:90, tp1:115, highs:[104,110,116], lows:[98,95,94] }).status, 'tp1');
  assert.equal(evaluateTrade({ entry:100, stop:90, tp1:115, highs:[104,110], lows:[98,89] }).status, 'stop');
  assert.equal(evaluateTrade({ entry:100, stop:90, tp1:115, highs:[104], lows:[98] }).status, 'open');
});
test('推薦快照保留當日模型參數', () => {
  const rows = snapshotRecommendations({ asOf:'2026-08-13', top3:[{ code:'2408', name:'測試', total:80, status:'可布局', valuation:{label:'便宜'}, price:82, support:78, stop:74, tp1:98, rr:2 }] });
  assert.equal(rows[0].modelVersion, 'v1.2');
  assert.equal(rows[0].stop, 74);
});
