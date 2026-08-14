import { runOfficialDailyUpdate } from '../src/official-bulk-import.mjs';
try{console.log(JSON.stringify(await runOfficialDailyUpdate(),null,2));}catch(error){console.error(JSON.stringify({event:'official_daily_fatal',error:error.message}));process.exitCode=1;}
