export const API_ROUTES = Object.freeze({ health:'/api/health', scan:'/api/scan', coverage:'/api/coverage' });

export function scanResponse(scan, freshness) {
  return {
    ok:true,
    status:'ready',
    asOf:scan.asOf,
    dataSource:scan.provider,
    provider:scan.provider,
    candidateCount:scan.coverage?.total ?? scan.ranked?.length ?? 0,
    dailyCoverageCount:scan.coverage?.dailyBars ?? 0,
    weeklyCoverageCount:scan.coverage?.weeklyBars ?? 0,
    coverage:scan.coverage,
    historyDiagnostics:scan.historyDiagnostics,
    insufficientData:scan.insufficientData ?? [],
    recommendations:{ top3:scan.top3 ?? [], top12:scan.top12 ?? [], watch:scan.watch ?? [] },
    ranked:scan.ranked ?? [],
    top3:scan.top3 ?? [],
    top12:scan.top12 ?? [],
    watch:scan.watch ?? [],
    validation:scan.validation,
    universe:scan.universe,
    market:scan.market,
    marketMode:scan.marketMode,
    release:scan.release,
    factorSources:scan.factorSources ?? {},
    freshness
  };
}

export function apiError(status, code, reason, details = {}) {
  return { status, body:{ ok:false, error:{ code, reason, ...details } } };
}
