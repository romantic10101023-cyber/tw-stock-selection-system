import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hydrateOfficialHistories, selectHistoryRefreshQueue } from '../src/history-pipeline.mjs';
import { loadTwseHistory } from '../src/price-history-provider.mjs';
import { loadTpexHistory } from '../src/tpex-history-provider.mjs';
import { applyTechnicalBatch } from '../src/technical-enrich.mjs';
import { partitionByCoverage } from '../src/data-coverage.mjs';

function monthRows(year, month, tpex = false) {
  const rows = [], date = new Date(Date.UTC(year, month - 1, 1));
  while (date.getUTCMonth() === month - 1) {
    if (![0,6].includes(date.getUTCDay())) {
      const roc = `${year - 1911}/${String(month).padStart(2,'0')}/${String(date.getUTCDate()).padStart(2,'0')}`;
      const price = 100 + rows.length;
      rows.push([roc,'1,200','100,000',`${price}.00`,`${price + 2}.00`,`${price - 2}.00`,`${price + 1}.00`,'+1.00','500']);
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return tpex ? { stat:'ok', tables:[{ fields:['日 期','成交張數','成交仟元','開盤','最高','最低','收盤','漲跌','筆數'], data:rows }] }
    : { stat:'OK', fields:['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價','漲跌價差','成交筆數'], data:rows };
}

function twseLoader(code, asOf, { existingBars }) {
  return loadTwseHistory(code, asOf, { existingBars, fetchJson:async url => {
    const value = new URL(url).searchParams.get('date');
    return monthRows(Number(value.slice(0,4)), Number(value.slice(4,6)));
  }, logger:{error() {}} });
}

function tpexLoader(code, asOf, { existingBars }) {
  return loadTpexHistory(code, asOf, { existingBars, fetchJson:async (_url, options) => {
    const [year, month] = options.body.get('date').split('/').map(Number);
    return monthRows(year, month, true);
  }, logger:{error() {}} });
}

const stock = (code, market) => ({ code, market, name:code, price:100, reportedEps:5, revenueYoY:10, volume5:2000 });

test('production queue always includes mandatory 2330 and 6488 smoke symbols', () => {
  const stocks = [stock('0050','twse'), stock('2330','twse'), stock('6488','tpex'), stock('1102','twse')];
  assert.deepEqual(selectHistoryRefreshQueue(stocks, {}, 2).map(item => item.code), ['2330','6488']);
});

test('2330 and 6488 pass 120/60 through the full production history pipeline', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tw-history-pipeline-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  const stocks = [stock('0050','twse'), stock('2330','twse'), stock('6488','tpex')];
  const result = await hydrateOfficialHistories(stocks, { cachePath:join(dir,'history-cache.json'), asOf:'2026-08-13', batchSize:2, loaders:{twse:twseLoader,tpex:tpexLoader}, logger:{log(){},error(){}} });
  const enriched = applyTechnicalBatch(stocks, result.historiesByCode);
  const partition = partitionByCoverage(enriched);
  assert.deepEqual(partition.eligible.map(item => item.code).sort(), ['2330','6488']);
  for (const code of ['2330','6488']) {
    const history = result.historiesByCode[code];
    assert.ok(history.dailyBars >= 120, `${code} daily=${history.dailyBars}`);
    assert.ok(history.weeklyBars >= 60, `${code} weekly=${history.weeklyBars}`);
    assert.equal(result.diagnostics.stocks.find(item => item.code === code).passesHistoryGate, true);
  }
  assert.equal(result.diagnostics.monthRequestSuccessCount, 36);
  assert.equal(result.diagnostics.stockFailureCount, 0);
});

test('one stock history failure does not eliminate other stocks', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tw-history-failure-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  const result = await hydrateOfficialHistories([stock('2330','twse'),stock('6488','tpex')], { cachePath:join(dir,'history-cache.json'), asOf:'2026-08-13', batchSize:2, loaders:{twse:async()=>{throw new Error('offline')},tpex:tpexLoader}, logger:{log(){},error(){}} });
  assert.equal(result.diagnostics.stockFailureCount, 1);
  assert.ok(result.historiesByCode['6488'].dailyBars >= 120);
});

test('persistent queue admits more than seven stocks and cached history counts across batches', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tw-history-queue-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  const stocks = Array.from({ length:12 }, (_, index) => stock(String(1100 + index), 'twse'));
  const options = { cachePath:join(dir,'history-cache.json'), queuePath:join(dir,'history-queue.json'), asOf:'2026-08-13', batchSize:8, priorityCodes:[], loaders:{ twse:twseLoader }, logger:{log(){},error(){}} };
  const first = await hydrateOfficialHistories(stocks, options);
  assert.equal(first.diagnostics.refreshQueue.length, 8);
  assert.equal(first.diagnostics.historyQueueProcessed, 8);
  const second = await hydrateOfficialHistories(stocks, options);
  assert.equal(second.diagnostics.cachedCount, 8);
  assert.equal(Object.values(second.historiesByCode).filter(history => history.dailyBars >= 120 && history.weeklyBars >= 60).length, 12);
  assert.equal(second.diagnostics.historyQueueProcessed, 12);
});
