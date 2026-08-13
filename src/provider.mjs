import { SOURCE_STATUS, normalizeStock } from './data-model.mjs';

export function createProvider({ liveLoader, cachedLoader, demoLoader }) {
  return {
    async load(asOf) {
      if (liveLoader) {
        try {
          const live = await liveLoader(asOf);
          if (live?.length) return { status: SOURCE_STATUS.LIVE, stocks: live.map(x => normalizeStock({...x, source: SOURCE_STATUS.LIVE, asOf})) };
        } catch (error) { console.warn(`live provider unavailable: ${error.message}`); }
      }
      if (cachedLoader) {
        try {
          const cached = await cachedLoader(asOf);
          if (cached?.length) return { status: SOURCE_STATUS.CACHED, stocks: cached.map(x => normalizeStock({...x, source: SOURCE_STATUS.CACHED, asOf})) };
        } catch (error) { console.warn(`cache provider unavailable: ${error.message}`); }
      }
      const demo = await demoLoader(asOf);
      return { status: SOURCE_STATUS.DEMO, stocks: demo.map(x => normalizeStock({...x, source: SOURCE_STATUS.DEMO, asOf})) };
    }
  };
}
