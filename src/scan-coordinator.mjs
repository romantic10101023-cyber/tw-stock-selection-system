const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createScanCoordinator({runBatch,logger=console,retryDelayMs=30_000}={}) {
  let state={status:'idle',startedAt:null,finishedAt:null,exitCode:null,error:null},active=null,stopping=false;
  async function loop(){while(!stopping){try{const result=await runBatch();state={...state,status:result?.queueComplete?'complete':'running',error:null,exitCode:0};if(result?.queueComplete)break;if(result?.processedThisBatch===0)await wait(retryDelayMs);else await new Promise(resolve=>setImmediate(resolve));}catch(error){state={...state,status:'recovering',error:error.message,exitCode:1};logger.error(JSON.stringify({event:'auto_scan_error',error:error.message}));await wait(retryDelayMs);}}state={...state,status:state.status==='complete'?'complete':'stopped',finishedAt:new Date().toISOString()};active=null;}
  return {state:()=>({...state}),done:()=>active,start(){if(active)return false;stopping=false;state={status:'running',startedAt:new Date().toISOString(),finishedAt:null,exitCode:null,error:null};active=loop();return true;},stop(){stopping=true;}};
}
