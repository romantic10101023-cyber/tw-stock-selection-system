export function releaseGate(scan, { officialRequired = true } = {}) {
  const failures = [];
  if (officialRequired && !['live', 'cached'].includes(scan.provider)) failures.push('資料來源不是官方即時資料或官方快取');
  if (!scan.validation?.ok) failures.push('原始資料驗證失敗');
  if (scan.universe?.queueComplete === false) failures.push('完整普通股歷史佇列尚未掃描完成');
  if (!scan.coverage?.eligible) failures.push('沒有股票同時具備 120 根日線、60 根週線與完整官方基本資料');
  if ((scan.scoredIneligible ?? 0) > 0) failures.push('資料不足股票被送入評分');
  return { publish:failures.length === 0, failures };
}
