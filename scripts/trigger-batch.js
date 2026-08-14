const url=process.env.BATCH_TRIGGER_URL, token=process.env.BATCH_TRIGGER_TOKEN;
if(!url||!token){console.error(JSON.stringify({event:'fatal',error:'BATCH_TRIGGER_URL and BATCH_TRIGGER_TOKEN are required'}));process.exit(1);}
const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,accept:'application/json'}});
const body=await response.text();console.log(body);if(!response.ok)process.exit(1);
