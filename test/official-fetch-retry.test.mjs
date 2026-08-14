import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOfficial } from '../src/live-provider.mjs';

const quiet = { error() {} };

test('official timeout is retried and never produces fallback data', async () => {
  let calls = 0;
  const fetchImpl = async (_url, { signal }) => new Promise((resolve, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(Object.assign(new Error('timed out'), { name:'AbortError' })), { once:true });
  });
  await assert.rejects(fetchOfficial('https://official.example/universe', { fetchImpl, timeoutMs:2, attempts:2, retryDelaysMs:[0], minIntervalMs:0, sleepImpl:async()=>{}, logger:quiet }), /failed after 2 attempts/);
  assert.equal(calls, 2);
});

test('429 and 503 responses are retried before a real official response is returned', async () => {
  const statuses = [429, 503, 200];
  const delays = [];
  const result = await fetchOfficial('https://official.example/universe', {
    fetchImpl:async()=>new Response(statuses.shift() === 200 ? JSON.stringify([{ code:'2330' }]) : 'temporarily unavailable', { status:statuses.length === 2 ? 429 : statuses.length === 1 ? 503 : 200, headers:{'content-type':'application/json'} }),
    timeoutMs:1000, attempts:5, retryDelaysMs:[30,60,120,240], minIntervalMs:0, sleepImpl:async ms=>delays.push(ms), logger:quiet
  });
  assert.deepEqual(result, [{ code:'2330' }]);
  assert.deepEqual(delays, [30,60]);
});

