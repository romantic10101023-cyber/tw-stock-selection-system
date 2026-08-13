import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readMarketHistory(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return []; }
}

export async function appendMarketSnapshot(path, snapshot, maxRows = 400) {
  const history = await readMarketHistory(path);
  const next = history.filter(row => row.date !== snapshot.date).concat(snapshot).sort((a, b) => a.date.localeCompare(b.date)).slice(-maxRows);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(next, null, 2));
  return next;
}

export function historyInputs(history) {
  return {
    indexCloses: history.map(row => Number(row.close)).filter(Number.isFinite),
    breadth: history.at(-1) ? { advancers: history.at(-1).advancers, decliners: history.at(-1).decliners } : {}
  };
}
