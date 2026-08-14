import { runProductionBatch } from '../src/production-batch.mjs';
try { await runProductionBatch(); process.exitCode=0; } catch(error) { console.error(JSON.stringify({event:'fatal',error:error.message,stack:error.stack})); process.exitCode=1; }
