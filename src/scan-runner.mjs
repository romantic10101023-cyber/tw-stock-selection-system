import { spawn } from 'node:child_process';

export function createScanRunner({ root, dataDir, logger=console, spawnImpl=spawn }={}) {
  let state={status:'idle',startedAt:null,finishedAt:null,exitCode:null,error:null},child=null;
  return { state:()=>({...state}),start(){
    if(child)return false;
    state={status:'running',startedAt:new Date().toISOString(),finishedAt:null,exitCode:null,error:null};
    logger.log(JSON.stringify({event:'batch_process_started',dataDir}));
    child=spawnImpl(process.execPath,['scripts/scan-batch.js'],{cwd:root,env:{...process.env,DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
    child.stdout?.on('data',chunk=>logger.log(String(chunk).trim()));child.stderr?.on('data',chunk=>logger.error(String(chunk).trim()));
    child.on('error',error=>{state={...state,status:'failed',finishedAt:new Date().toISOString(),error:error.message};child=null;logger.error(JSON.stringify({event:'batch_process_error',error:error.message}));});
    child.on('exit',code=>{state={...state,status:code===0?'complete':'failed',finishedAt:new Date().toISOString(),exitCode:code,error:code===0?null:`Batch exited with code ${code}`};child=null;logger[code===0?'log':'error'](JSON.stringify({event:'batch_process_finished',exitCode:code}));});
    return true;
  }};
}
