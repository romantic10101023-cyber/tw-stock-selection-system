import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuotes, parseOfficialProductHtml, parseSecurityMaster } from '../src/security-master-provider.mjs';
import { filterUniverse } from '../src/universe.mjs';
import { selectHistoryRefreshQueue } from '../src/history-pipeline.mjs';

const quote = (code, name, market = 'twse') => ({ code, name, market, price:100, volume5:5000 });
const master = { ...parseSecurityMaster([{ 公司代號:'1216', 產業別:'02' },{ 公司代號:'1301', 產業別:'03' },{ 公司代號:'2881', 產業別:'17' },{ 公司代號:'2501', 產業別:'14' }], 'twse'), ...parseSecurityMaster([{ SecuritiesCompanyCode:'6488', SecuritiesIndustryCode:'24' }], 'tpex') };
const productRows = codes => `<tr><td colspan="7"><b>指數股票型基金 ETF</b></td></tr>${codes.map(code => `<tr><td>${code} 官方基金</td><td>ISIN</td><td></td><td>上市</td><td></td><td>CEOGEU</td><td></td></tr>`).join('')}`;
const official = { companies:master, products:parseOfficialProductHtml(productRows(['0050','0052','0056']), 'twse', 'official-test') };

test('official security master excludes ETFs, financials and construction before the candidate universe', () => {
  const raw = [quote('0050','元大台灣50'),quote('0052','富邦科技'),quote('0056','元大高股息'),quote('2881','富邦金'),quote('2501','國建'),quote('1216','統一'),quote('1301','台塑'),quote('6488','環球晶','tpex')];
  const result = filterUniverse(classifyQuotes(raw, official));
  assert.deepEqual(result.included.map(stock => stock.code), ['1216','1301','6488']);
  for (const code of ['0050','0052','0056']) assert.equal(result.excluded.find(stock => stock.code === code).isEtf, true);
  assert.equal(result.excluded.find(stock => stock.code === '2881').isFinancial, true);
  assert.equal(result.excluded.find(stock => stock.code === '2501').isConstruction, true);
  assert.equal(result.counts.includedCommonStockCount, 3);
  assert.equal(result.counts.excludedEtfFundCount, 3);
});

test('excluded securities never enter the persistent history queue', () => {
  const filtered = filterUniverse(classifyQuotes([quote('0050','元大台灣50'),quote('2881','富邦金'),quote('2501','國建'),quote('1216','統一'),quote('6488','環球晶','tpex')], official));
  assert.deepEqual(selectHistoryRefreshQueue(filtered.included, {}, filtered.included.length).map(stock => stock.code).sort(), ['1216','6488']);
});

test('official product parser normalizes numeric, alphabetic, whitespace and hyphenated ETF codes', () => {
  const products = parseOfficialProductHtml(productRows(['00685L','00945-B',' 00981A ','009802']), 'twse', 'official-test');
  for (const code of ['00685L','00945B','00981A','009802']) assert.equal(products[code].isEtf, true);
});
