export function releaseGate(scan, { officialRequired = true } = {}) {
  const failures = [];
  if (officialRequired && !['live', 'cached'].includes(scan.provider)) failures.push('不是官方資料或合格的官方資料快取');
  if (!scan.validation?.ok) failures.push('行情批次驗證失敗');
  if (!scan.coverage?.eligible) failures.push('沒有任何股票同時具備 120 根日線、60 根週線與完整基本資料');
  if ((scan.scoredIneligible ?? 0) > 0) failures.push('資料不足股票被送入推薦評分');
  return { publish:failures.length === 0, failures };
}
