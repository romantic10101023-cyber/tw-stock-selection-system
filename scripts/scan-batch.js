import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadOfficialQuotes } from '../src/live-provider.mjs';
import { classifyQuotes, loadOfficialSecurityMaster, SECURITY_MASTER_URLS } from '../src/security-master-provider.mjs';
import { filterUniverse } from '../src/universe.mjs';
import { loadOfficialFactorsDetailed } from '../src/factor-loader.mjs';
import { enrichBatch } from '../src/enrich.mjs';
import { getCachedHistory, readHistoryCache, writeHistoryCache } from '../src/history-cache.mjs';
import { loadTwseHistory } from '../src/price-history-provider.mjs';
import { loadTpexHistory } from '../src/tpex-history-provider.mjs';
import { historyOutcome, runPersistentBatch } from '../src/batch-worker.mjs';
import { applyTechnicalBatch } from '../src/technical-enrich.mjs';
import { coverageReport, partitionByCoverage } from '../src/data-coverage.mjs';
import { buildLists } from '../src/engine.mjs';
import { releaseGate } from '../src/release-gate.mjs';
import { atomicWriteJson, createQueue, queueSummary, readJson, statePaths } from '../src/batch-state.mjs';
import { aggregateWeeklyBars } from '../src/technical.mjs';
import { appendScan } from '../src/storage.mjs';

const dataDir=process.env.DATA_DIR??'data', asOf=process.env.MARKET_DATE??new Date().toISOString().slice(0,10), cachePath=join(dataDir,'history-cache.json');
await mkdir(dataDir,{recursive:true});
try {
  const quotes=await loadOfficialQuotes(asOf), master=await loadOfficialSecurityMaster();
  const universe=filterUniverse(classifyQuotes(quotes,master));
  universe.counts.officialEtfCount=master.officialEtfSymbols.length;
  universe.counts.excludedEtfSymbols=universe.excluded.filter(s=>s.isEtf||s.isFund||s.isEtn||s.isReit).map(s=>s.code);
  universe.counts.excludedEtfNames=universe.excluded.filter(s=>s.isEtf||s.isFund||s.isEtn||s.isReit).map(s=>s.name);
  universe.counts.classificationSource=Object.values(SECURITY_MASTER_URLS);
  const factors=await loadOfficialFactorsDetailed(universe.included.map(s=>s.code));
  const stocks=enrichBatch(universe.included,factors.factors), byCode=new Map(stocks.map(s=>[s.code,s]));
  const paths=statePaths(dataDir),existingQueue=await readJson(paths.queue,null);
  if(!existingQueue){const cache=await readHistoryCache(cachePath);const migrated=createQueue(stocks).map(item=>{const bars=cache[item.code]?.bars??[],weekly=aggregateWeeklyBars(bars).length;return bars.length>=120&&weekly>=60?{...item,status:'success',dailyBars:bars.length,weeklyBars:weekly,finishedAt:new Date().toISOString()}:item;});await atomicWriteJson(paths.queue,migrated);console.log(JSON.stringify({event:'legacyCheckpointMigrated',success:migrated.filter(i=>i.status==='success').length,total:migrated.length}));}
  const loaders={twse:loadTwseHistory,tpex:loadTpexHistory};
  const batch=await runPersistentBatch({dataDir,stocks,batchSize:Math.min(20,Math.max(1,Number(process.env.HISTORY_BATCH_SIZE??10))),processStock:async item=>{
    const cached=await getCachedHistory(cachePath,item.code,asOf);
    const cachedOutcome=cached&&historyOutcome(cached);
    if(cachedOutcome?.success)return cachedOutcome;
    const history=await loaders[item.market](item.code,asOf,{existingBars:cached?.bars??[]});
    if(history.bars?.length)await writeHistoryCache(cachePath,item.code,history,asOf);
    return historyOutcome(history);
  }});
  if(batch.alreadyRunning)process.exit(0);
  const queue=await readJson(paths.queue,[]),summary=queueSummary(queue),histories={};
  for(const stock of stocks){const history=await getCachedHistory(cachePath,stock.code,asOf);if(history)histories[stock.code]=history;}
  const technical=applyTechnicalBatch(stocks,histories),coverage=coverageReport(technical),partition=partitionByCoverage(technical);
  const queueComplete=batch.queueComplete===true&&summary.deadLetterCount===0;
  const lists=queueComplete?buildLists(partition.eligible,'range'):{ranked:[],top12:[],top3:[],watch:[]};
  const checkpoint=await readJson(paths.checkpoint,{});
  const result={runAt:new Date().toISOString(),asOf,provider:'live',validation:{ok:true,count:quotes.length},factorSources:factors.sources,coverage,historyDiagnostics:{historyQueueTotal:summary.total,historyQueueProcessed:summary.processed,historyQueueRemaining:summary.remaining,historySuccessCount:summary.successCount,historyFailureCount:summary.deadLetterCount,validDailyCount:summary.dailyCoverageCount,validWeeklyCount:summary.weeklyCoverageCount,checkpoint},universe:{...universe.counts,queueComplete,deadLetterCount:summary.deadLetterCount},marketMode:'range',market:{mode:'range'},insufficientData:partition.insufficient.map(s=>({code:s.code,name:s.name,market:s.market,...s.eligibility})),scoredIneligible:0,...lists};
  result.release=releaseGate(result,{officialRequired:true});
  await atomicWriteJson(join(dataDir,'latest-scan.json'),result);await appendScan(join(dataDir,'scan-history.json'),result);
  process.exitCode=0;
} catch(error){console.error(JSON.stringify({event:'fatal',error:error.message,stack:error.stack}));process.exitCode=1;}
