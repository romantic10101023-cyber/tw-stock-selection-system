import { join } from 'node:path';
import { atomicWriteJson, createQueue, readJson, statePaths } from './batch-state.mjs';
import { appendScan } from './storage.mjs';
import { loadOfficialQuotes, getOfficialRequestState } from './live-provider.mjs';
import { classifyQuotes, loadOfficialSecurityMaster } from './security-master-provider.mjs';
import { filterUniverse } from './universe.mjs';

let refreshPromise = null;

export function finalizeUniverse(quotes, master) {
  const universe = filterUniverse(classifyQuotes(quotes, master));
  universe.counts.officialEtfCount = master.officialEtfSymbols.length;
  universe.counts.excludedEtfSymbols = universe.excluded.filter(stock => stock.isEtf || stock.isFund || stock.isEtn || stock.isReit).map(stock => stock.code);
  universe.counts.excludedEtfNames = universe.excluded.filter(stock => stock.isEtf || stock.isFund || stock.isEtn || stock.isReit).map(stock => stock.name);
  universe.counts.twseUniverseCount = master.marketCounts?.twse ?? Object.values(master.companies??{}).filter(item=>item.market==='twse').length;
  universe.counts.tpexUniverseCount = master.marketCounts?.tpex ?? Object.values(master.companies??{}).filter(item=>item.market==='tpex').length;
  universe.counts.universeSourceEndpoint = { quotes:quotes.sources??null, securityMaster:master.sources??null };
  universe.counts.classificationSource = Object.values(master.sources??{}).filter(Boolean);
  return universe;
}

export function prioritizeSmokeSymbols(stocks=[]){const mandatory=['2330','6488'],byCode=new Map(stocks.map(stock=>[stock.code,stock]));return[...mandatory.map(code=>byCode.get(code)).filter(Boolean),...stocks.filter(stock=>!mandatory.includes(stock.code))];}

async function fetchUniverse({ asOf, loadQuotes, loadMaster }) {
  const quotes = await loadQuotes(asOf);
  const master = await loadMaster();
  return { quotes, universe:finalizeUniverse(quotes, master) };
}

async function recordUniverseFailure(dataDir, error) {
  await appendScan(join(dataDir, 'scan-history.json'), {
    event:'universe_fetch_failed', status:'recovering', runAt:new Date().toISOString(),
    error:error.message, officialRequest:getOfficialRequestState(), demoFallback:false
  });
}

export async function loadUniverseForScan({ dataDir, asOf, loadQuotes=loadOfficialQuotes, loadMaster=loadOfficialSecurityMaster, logger=console } = {}) {
  const paths = statePaths(dataDir);
  const cached = await readJson(paths.universe, null);
  if (cached?.universe?.included?.length) {
    const existingQueue = await readJson(paths.queue, null);
    if (!existingQueue) await atomicWriteJson(paths.queue, createQueue(prioritizeSmokeSymbols(cached.universe.included)));
    return { ...cached, source:'cache' };
  }
  try {
    const fetched = await fetchUniverse({ asOf, loadQuotes, loadMaster });
    const snapshot = { version:1, savedAt:new Date().toISOString(), asOf, queueCreationStatus:'pending', ...fetched };
    await atomicWriteJson(paths.universe, snapshot);
    const existingQueue = await readJson(paths.queue, null);
    if (!existingQueue) await atomicWriteJson(paths.queue, createQueue(prioritizeSmokeSymbols(fetched.universe.included)));
    const completed={...snapshot,queueCreationStatus:'created',queueCreatedAt:new Date().toISOString()};await atomicWriteJson(paths.universe,completed);
    return { ...completed, source:'official' };
  } catch (error) {
    await recordUniverseFailure(dataDir, error);
    logger.error?.(JSON.stringify({ event:'universe_fetch_failed', status:'recovering', error:error.message, officialRequest:getOfficialRequestState() }));
    throw error;
  }
}

export function refreshUniverseInBackground({ dataDir, asOf, loadQuotes=loadOfficialQuotes, loadMaster=loadOfficialSecurityMaster, logger=console } = {}) {
  if (refreshPromise) return false;
  refreshPromise = (async () => {
    try {
      const fetched = await fetchUniverse({ asOf, loadQuotes, loadMaster });
      await atomicWriteJson(statePaths(dataDir).universe, { version:1, savedAt:new Date().toISOString(), asOf, ...fetched });
      logger.log?.(JSON.stringify({ event:'universe_refreshed', included:fetched.universe.included.length }));
    } catch (error) { await recordUniverseFailure(dataDir, error); logger.error?.(JSON.stringify({ event:'universe_refresh_failed', error:error.message })); }
    finally { refreshPromise = null; }
  })();
  return true;
}
