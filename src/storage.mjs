import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return fallback; }
}

export async function appendScan(path, scan) {
  const history = await readJson(path, []);
  history.push(scan);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(history.slice(-120), null, 2));
  return scan;
}
