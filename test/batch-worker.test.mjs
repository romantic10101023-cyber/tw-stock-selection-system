import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireLease, atomicWriteJson, createQueue, readJson, recoverStaleRunning, releaseLease, statePaths } from '../src/batch-state.mjs';
import { historyOutcome, runPersistentBatch } from '../src/batch-worker.mjs';

const stocks=n=>Array.from({length:n},(_,i)=>({code:String(1000+i),market:'twse',name:String(i)}));
const ok={success:true,dailyBars:356,weeklyBars:75};
async function temp(t){const dir=await mkdtemp(join(tmpdir(),'tw-batch-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('restart after 209 successes continues with stock 210 and never refetches completed stocks',async t=>{const dir=await temp(t),paths=statePaths(dir),all=stocks(220),queue=createQueue(all).map((item,i)=>i<209?{...item,status:'success',dailyBars:356,weeklyBars:75}:item);await atomicWriteJson(paths.queue,queue);const seen=[];await runPersistentBatch({dataDir:dir,stocks:all,processStock:async item=>(seen.push(item.code),ok),logger:{log(){},error(){}}});assert.equal(seen[0],all[209].code);assert.equal(seen.length,10);});
test('running older than 15 minutes becomes retryable',()=>{const old=new Date('2026-01-01T00:00:00Z'),now=new Date('2026-01-01T00:16:00Z');assert.equal(recoverStaleRunning([{code:'2330',status:'running',startedAt:old.toISOString()}],now)[0].status,'retryable');});
test('stale lease can be taken over and concurrent lease cannot',async t=>{const dir=await temp(t),path=statePaths(dir).lock,first=await acquireLease(path,new Date('2026-01-01T00:00:00Z'));assert.equal(first.acquired,true);assert.equal((await acquireLease(path,new Date('2026-01-01T00:01:00Z'))).acquired,false);assert.equal((await acquireLease(path,new Date('2026-01-01T00:16:00Z'))).staleTakenOver,true);await releaseLease(path);});
test('one stock failure does not stop batch and third failure enters dead-letter',async t=>{const dir=await temp(t),all=stocks(2);let nowMs=Date.parse('2026-01-01T00:00:00Z');for(let run=0;run<3;run++){await runPersistentBatch({dataDir:dir,stocks:all,batchSize:2,now:()=>new Date(nowMs),processStock:async item=>{if(item.code==='1000')throw new Error('offline');return ok;},logger:{log(){},error(){}}});nowMs+=200_000;}const queue=await readJson(statePaths(dir).queue,[]);assert.equal(queue.find(i=>i.code==='1000').status,'dead-letter');assert.equal(queue.find(i=>i.code==='1001').status,'success');});
test('atomic checkpoint leaves no temporary files and queue complete is not rebuilt',async t=>{const dir=await temp(t),path=join(dir,'checkpoint.json');await atomicWriteJson(path,{value:1});assert.equal((await readJson(path,{})).value,1);assert.deepEqual((await readdir(dir)).filter(name=>name.endsWith('.tmp')),[]);let calls=0;await runPersistentBatch({dataDir:dir,stocks:stocks(1),processStock:async()=>{calls++;return ok;},logger:{log(){},error(){}}});await runPersistentBatch({dataDir:dir,stocks:stocks(1),processStock:async()=>{calls++;return ok;},logger:{log(){},error(){}}});assert.equal(calls,1);});
test('history success requires both 120 daily and 60 weekly bars',()=>{const bars=Array.from({length:120},(_,i)=>({date:new Date(Date.UTC(2023,0,1+i)).toISOString().slice(0,10),open:1,high:2,low:1,close:2,volume:1}));assert.equal(historyOutcome({bars}).success,false);assert.equal(historyOutcome({bars:Array.from({length:420},(_,i)=>({...bars[0],date:new Date(Date.UTC(2023,0,1+i)).toISOString().slice(0,10)}))}).success,true);});
