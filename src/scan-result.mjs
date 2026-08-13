import { readJson } from './storage.mjs';

export async function readLatestScan(path) {
  const scan = await readJson(path, null);
  if (!scan || !Array.isArray(scan.ranked)) return null;
  return scan;
}

export function scanFreshness(scan, now = new Date()) {
  if (!scan?.runAt) return { fresh:false, ageHours:null, reason:'沒有掃描時間' };
  const ageHours = (now.getTime() - new Date(scan.runAt).getTime()) / 3600000;
  return { fresh: ageHours <= 30, ageHours: Math.round(ageHours * 10) / 10, reason: ageHours <= 30 ? '資料在有效期限內' : '掃描結果過期' };
}
