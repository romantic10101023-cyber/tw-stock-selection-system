import { aggregateWeeklyBars, MIN_DAILY_BARS, MIN_WEEKLY_BARS } from './technical.mjs';
import { atomicWriteJson, acquireLease, claimBatch, completeItem, createQueue, persistenceStatus, queueSummary, readJson, recoverStaleRunning, releaseLease, statePaths } from './batch-state.mjs';

export async function runPersistentBatch({ dataDir, stocks, processStock, batchSize=10, now=()=>new Date(), logger=console, stockTimeoutMs=180_000, diagnostics=()=>({}) } = {}) {
  const paths=statePaths(dataDir), lease=await acquireLease(paths.lock,now());
  if (!lease.acquired) { logger.log(JSON.stringify({event:'alreadyRunning',lock:lease.payload})); return { alreadyRunning:true,exitCode:0 }; }
  try {
    let queue=createQueue(stocks,await readJson(paths.queue,[]));
    const staleRecovered=queue.filter(item=>item.status==='running'&&now().getTime()-new Date(item.startedAt).getTime()>15*60*1000).length;
    queue=recoverStaleRunning(queue,now());
    const claimed=claimBatch(queue,batchSize,now()); queue=claimed.queue;
    await atomicWriteJson(paths.queue,queue);
    const checkpoint=await readJson(paths.checkpoint,{currentBatch:0});
    checkpoint.staleRecovered=(checkpoint.staleRecovered??0)+staleRecovered;
    const batchNumber=Number(checkpoint.currentBatch??0)+1;
    await atomicWriteJson(paths.checkpoint,{...checkpoint,currentBatch:batchNumber,lastStartedAt:now().toISOString(),lastProgressAt:now().toISOString(),status:'running',batchSize,persistenceStatus:await persistenceStatus(dataDir)});
    logger.log(JSON.stringify({event:'batchStarted',batch:batchNumber,size:claimed.batch.length}));
    if (!claimed.batch.length) {
      const summary=queueSummary(queue), complete=summary.remaining===0;
      await atomicWriteJson(paths.checkpoint,{...checkpoint,...summary,currentBatch:batchNumber,lastFinishedAt:now().toISOString(),lastProgressAt:now().toISOString(),lastExitCode:0,status:complete?'queueComplete':'waiting_retry',batchSize,persistenceStatus:await persistenceStatus(dataDir)});
      logger.log(JSON.stringify({event:complete?'queueComplete':'batchFinished',...summary})); return { ...summary,queueComplete:complete,exitCode:0 };
    }
    const results=await readJson(paths.results,{}), failures=await readJson(paths.failures,[]);
    for (const claimedItem of claimed.batch) {
      const index=queue.findIndex(item=>item.code===claimedItem.code);
      const stockStartedAt=now().toISOString();
      const progressCheckpoint=await readJson(paths.checkpoint,checkpoint);
      await atomicWriteJson(paths.checkpoint,{...progressCheckpoint,...queueSummary(queue),...diagnostics(),currentBatch:batchNumber,currentCode:claimedItem.code,currentStockName:claimedItem.name,currentStockStartedAt:stockStartedAt,lastProgressAt:stockStartedAt,status:'running',batchSize,persistenceStatus:await persistenceStatus(dataDir)});
      const controller=new AbortController();
      let rejectDeadline;
      const deadlineError=Object.assign(new Error(`stock processing timeout after ${stockTimeoutMs/1000} seconds`),{stockTimeout:true});
      const deadlinePromise=new Promise((_resolve,reject)=>{rejectDeadline=reject;});
      const deadline=setTimeout(()=>{controller.abort(deadlineError);rejectDeadline(deadlineError);},stockTimeoutMs);
      try {
        const outcome=await Promise.race([processStock(claimedItem,{signal:controller.signal}),deadlinePromise]);
        queue[index]=completeItem(queue[index],outcome,now());
        results[claimedItem.code]={...outcome,code:claimedItem.code,market:claimedItem.market,updatedAt:now().toISOString()};
        if(!outcome.success){failures.push({code:claimedItem.code,market:claimedItem.market,error:outcome.error,attempt:queue[index].attempts,at:now().toISOString()});logger.error(JSON.stringify({event:'stockFailed',code:claimedItem.code,error:outcome.error,status:queue[index].status}));}
      } catch (error) {
        queue[index]=completeItem(queue[index],{success:false,error:error.message},now());
        failures.push({code:claimedItem.code,market:claimedItem.market,error:error.message,attempt:queue[index].attempts,at:now().toISOString()});
        logger.error(JSON.stringify({event:'stockFailed',code:claimedItem.code,error:error.message,status:queue[index].status}));
      } finally { clearTimeout(deadline); }
      await atomicWriteJson(paths.queue,queue); await atomicWriteJson(paths.results,results); await atomicWriteJson(paths.failures,failures);
      const summary=queueSummary(queue);
      const completedAt=now().toISOString(),diag=diagnostics();
      await atomicWriteJson(paths.checkpoint,{...checkpoint,...summary,...diag,currentBatch:batchNumber,lastStartedAt:checkpoint.lastStartedAt??completedAt,lastProgressAt:completedAt,lastCompletedCode:claimedItem.code,lastCompletedAt:completedAt,currentCode:null,currentStockName:null,currentStockStartedAt:null,status:'running',batchSize,lastError:queue[index].lastError??checkpoint.lastError??null,timeoutCount:diag.timeoutCount??checkpoint.timeoutCount??0,persistenceStatus:await persistenceStatus(dataDir)});
    }
    const summary=queueSummary(queue);
    const latestCheckpoint=await readJson(paths.checkpoint,checkpoint);
    await atomicWriteJson(paths.checkpoint,{...latestCheckpoint,...summary,currentBatch:batchNumber,lastStartedAt:latestCheckpoint.lastStartedAt??now().toISOString(),lastFinishedAt:now().toISOString(),lastProgressAt:now().toISOString(),lastExitCode:0,status:summary.remaining?'batch_complete':'queueComplete',batchSize,persistenceStatus:await persistenceStatus(dataDir)});
    logger.log(JSON.stringify({event:'batchFinished',processed:claimed.batch.length,succeeded:summary.successCount,retryable:summary.retryableCount,deadLetter:summary.deadLetterCount,remaining:summary.remaining,dailyCoverage:summary.dailyCoverageCount,weeklyCoverage:summary.weeklyCoverageCount}));
    return {...summary,processedThisBatch:claimed.batch.length,exitCode:0};
  } finally { await releaseLease(paths.lock); }
}

export function historyOutcome(history) { const dailyBars=history.bars?.length??0,weeklyBars=aggregateWeeklyBars(history.bars??[]).length; return {success:dailyBars>=MIN_DAILY_BARS&&weeklyBars>=MIN_WEEKLY_BARS,dailyBars,weeklyBars,error:dailyBars<MIN_DAILY_BARS?`daily history insufficient ${dailyBars}/${MIN_DAILY_BARS}`:weeklyBars<MIN_WEEKLY_BARS?`weekly history insufficient ${weeklyBars}/${MIN_WEEKLY_BARS}`:null}; }
