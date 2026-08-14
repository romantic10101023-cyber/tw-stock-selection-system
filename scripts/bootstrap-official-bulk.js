import { runOfficialBulkImport } from '../src/official-bulk-import.mjs';
try{console.log(JSON.stringify(await runOfficialBulkImport(),null,2));}catch(error){console.error(JSON.stringify({event:'official_bulk_fatal',error:error.message}));process.exitCode=1;}
