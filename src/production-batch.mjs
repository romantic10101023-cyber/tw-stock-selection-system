import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadUniverseForScan, refreshUniverseInBackground } from './universe-store.mjs';
import { loadOfficialFactorsDetailed } from './factor-loader.mjs';
import { enrichBatch } from './enrich.mjs';
import { readHistoryCache } from './history-cache.mjs';
import { loadTwseHistory } from './price-history-provider.mjs';
import { loadTpexHistory } from './tpex-history-provider.mjs';
import { historyOutcome, runPersistentBatch } from './batch-worker.mjs';
import { applyTechnicalBatch } from './technical-enrich.mjs';
import { coverageReport, partitionByCoverage } from './data-coverage.mjs';
import { buildLists } from './engine.mjs';
import { releaseGate } from './release-gate.mjs';
import { atomicWriteJson, createQueue, queueSummary, readJson, statePaths } from './batch-state.mjs';
import { aggregateWeeklyBars } from './technical.mjs';
import { appendScan } from './storage.mjs';

export async function runProductionBatch({dataDir=process.env.DATA_DIR??'data',asOf=process.env.MARKET_DATE??new Date().toISOString().slice(0,10),logger=console,refreshUniverse=false}={}) {
  const cachePath=join(dataDir,'history-cache.json'),symbolCacheDir=join(dataDir,'history-by-symbol');await mkdir(symbolCacheDir,{recursive:true});
  const historyCache=await readHistoryCache(cachePath);
  for(const file of await readdir(symbolCacheDir)){if(!file.endsWith('.json'))continue;const code=file.slice(0,-5),payload=await readJson(join(symbolCacheDir,file),null);if(payload?.bars?.length)historyCache[code]=payload;}
  const snapshot=await loadUniverseForScan({dataDir,asOf,logger}),universe=snapshot.universe,quotes=snapshot.quotes??[...universe.included,...universe.excluded],paths=statePaths(dataDir);
  const existingQueue=await readJson(paths.queue,createQueue(universe.included));
  let migratedCount=0;
  const migrated=existingQueue.map(item=>{const bars=(historyCache[item.code]?.bars??[]).filter(bar=>bar.date<=asOf),weekly=aggregateWeeklyBars(bars).length;if(item.status!=='success'&&bars.length>=120&&weekly>=60){migratedCount++;return{...item,status:'success',dailyBars:bars.length,weeklyBars:weekly,finishedAt:new Date().toISOString(),lastError:null};}return item;});
  if(migratedCount){await atomicWriteJson(paths.queue,migrated);logger.log(JSON.stringify({event:'legacyCheckpointMigrated',success:migratedCount,total:migrated.length}));}
  const factors=await loadOfficialFactorsDetailed(universe.included.map(s=>s.code)),stocks=enrichBatch(universe.included,factors.factors);
  const loaders={twse:loadTwseHistory,tpex:loadTpexHistory};
  const batch=await runPersistentBatch({dataDir,stocks,logger,batchSize:Math.min(10,Math.max(1,Number(process.env.HISTORY_BATCH_SIZE??10))),processStock:async item=>{
    const existingBars=(historyCache[item.code]?.bars??[]).filter(bar=>bar.date<=asOf),cachedOutcome=historyOutcome({bars:existingBars});
    if(cachedOutcome.success)return cachedOutcome;
    const history=await loaders[item.market](item.code,asOf,{existingBars}),outcome=historyOutcome(history);
    if(history.bars?.length){historyCache[item.code]={...history,bars:history.bars,dailyBars:outcome.dailyBars,weeklyBars:outcome.weeklyBars,cachedAt:new Date().toISOString()};await atomicWriteJson(join(symbolCacheDir,`${item.code}.json`),historyCache[item.code]);}
    return outcome;
  }});
  if(batch.alreadyRunning)return batch;
  const queue=await readJson(paths.queue,[]),summary=queueSummary(queue),histories={};
  for(const stock of stocks){const bars=(historyCache[stock.code]?.bars??[]).filter(bar=>bar.date<=asOf);if(bars.length)histories[stock.code]={...historyCache[stock.code],bars,source:'cached'};}
  const technical=applyTechnicalBatch(stocks,histories),coverage=coverageReport(technical),partition=partitionByCoverage(technical),queueComplete=batch.queueComplete===true&&summary.deadLetterCount===0,lists=queueComplete?buildLists(partition.eligible,'range'):{ranked:[],top12:[],top3:[],watch:[]},checkpoint=await readJson(paths.checkpoint,{});
  const result={runAt:new Date().toISOString(),asOf,provider:'live',validation:{ok:true,count:quotes.length},factorSources:factors.sources,coverage,historyDiagnostics:{historyQueueTotal:summary.total,historyQueueProcessed:summary.processed,historyQueueRemaining:summary.remaining,historySuccessCount:summary.successCount,historyFailureCount:summary.failedCount,historyRetryCount:summary.retryCount,historyDeadLetterCount:summary.deadLetterCount,staleRecovered:checkpoint.staleRecovered??0,validDailyCount:summary.dailyCoverageCount,validWeeklyCount:summary.weeklyCoverageCount,checkpoint},universe:{...universe.counts,queueComplete,deadLetterCount:summary.deadLetterCount},marketMode:'range',market:{mode:'range'},insufficientData:partition.insufficient.map(s=>({code:s.code,name:s.name,market:s.market,...s.eligibility})),scoredIneligible:0,...lists};
  result.release=releaseGate(result,{officialRequired:true});
  await atomicWriteJson(join(dataDir,'latest-scan.json'),result);
  await appendScan(join(dataDir,'scan-history.json'),{runAt:result.runAt,asOf,provider:'live',queue:summary,release:result.release,top3:result.top3.map(stock=>stock.code)});
  if(refreshUniverse&&snapshot.source==='cache') refreshUniverseInBackground({dataDir,asOf,logger});
  return {...batch,summary,result};
}
