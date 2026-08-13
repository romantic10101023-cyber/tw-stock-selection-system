export function releaseGate(scan, { officialRequired = true } = {}) {
  const failures = [];
  if (officialRequired && scan.provider !== 'live' && scan.provider !== 'cached') failures.push('不是官方或合格快取資料');
  if (!scan.validation?.ok) failures.push('批次資料驗證失敗');
  if (!scan.coverage || scan.coverage.dailyBars < scan.coverage.total) failures.push('部分股票缺少至少120根日線');
  if (!scan.coverage || scan.coverage.weeklyBars < scan.coverage.total) failures.push('部分股票缺少至少60根週線');
  return { publish: failures.length === 0, failures };
}
