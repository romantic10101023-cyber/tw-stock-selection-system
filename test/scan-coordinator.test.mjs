import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanCoordinator } from '../src/scan-coordinator.mjs';

test('API coordinator automatically continues batches without child process callbacks',async()=>{let calls=0;const coordinator=createScanCoordinator({runBatch:async()=>{calls++;return calls===3?{queueComplete:true}:{processedThisBatch:10,summary:{remaining:30-calls*10}};},retryDelayMs:1,logger:{error(){}}});assert.equal(coordinator.start(),true);assert.equal(coordinator.start(),false);await coordinator.done();assert.equal(calls,3);assert.equal(coordinator.state().status,'complete');});

test('coordinator recovers from a batch-level rejection and continues',async()=>{let calls=0;const coordinator=createScanCoordinator({runBatch:async()=>{calls++;if(calls===1)throw new Error('restart-like failure');return{queueComplete:true};},retryDelayMs:1,logger:{error(){}}});coordinator.start();await coordinator.done();assert.equal(calls,2);assert.equal(coordinator.state().status,'complete');});
