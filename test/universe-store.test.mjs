import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { atomicWriteJson, readJson, statePaths } from '../src/batch-state.mjs';
import { loadUniverseForScan } from '../src/universe-store.mjs';

async function temp(t){const dir=await mkdtemp(join(tmpdir(),'tw-universe-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const quote={code:'2330',name:'台積電',market:'twse',price:100};
const company={code:'2330',market:'twse',securityType:'common_stock',industry:'半導體業',isCommonStock:true,isEtf:false,isFund:false,isEtn:false,isReit:false,isWarrant:false,isDepositaryReceipt:false,isPreferredShare:false,isFinancial:false,isConstruction:false,classificationSource:'official-test'};
const master={companies:{'2330':company},products:{},officialEtfSymbols:[]};

test('successful official universe atomically creates universe.json and queue.json',async t=>{const dir=await temp(t);const result=await loadUniverseForScan({dataDir:dir,asOf:'2026-08-14',loadQuotes:async()=>[quote],loadMaster:async()=>master,logger:{error(){}}});const paths=statePaths(dir);assert.equal(result.source,'official');assert.equal((await readJson(paths.universe,null)).universe.included[0].code,'2330');assert.equal((await readJson(paths.queue,[]))[0].status,'pending');});

test('persisted universe restores queue offline and timeout cannot clear existing progress',async t=>{const dir=await temp(t),paths=statePaths(dir);await loadUniverseForScan({dataDir:dir,asOf:'2026-08-14',loadQuotes:async()=>[quote],loadMaster:async()=>master,logger:{error(){}}});const queue=await readJson(paths.queue,[]);queue[0]={...queue[0],status:'success',dailyBars:356,weeklyBars:75};await atomicWriteJson(paths.queue,queue);let called=false;const restored=await loadUniverseForScan({dataDir:dir,asOf:'2026-08-15',loadQuotes:async()=>{called=true;throw new Error('timeout');},loadMaster:async()=>master,logger:{error(){}}});assert.equal(restored.source,'cache');assert.equal(called,false);assert.equal((await readJson(paths.queue,[]))[0].status,'success');});

test('failed initial universe records recovery error and no demo data',async t=>{const dir=await temp(t);await assert.rejects(loadUniverseForScan({dataDir:dir,asOf:'2026-08-14',loadQuotes:async()=>{throw new Error('official timeout');},loadMaster:async()=>master,logger:{error(){}}}),/official timeout/);const history=await readJson(join(dir,'scan-history.json'),[]);assert.equal(history[0].status,'recovering');assert.equal(history[0].demoFallback,false);assert.equal(await readJson(statePaths(dir).queue,null),null);});

