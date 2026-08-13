import { open, readFile, unlink } from 'node:fs/promises';

export async function acquireScanLock(path, staleMs = 45 * 60 * 1000) {
  try {
    const handle = await open(path, 'wx');
    await handle.writeFile(JSON.stringify({ pid:process.pid, startedAt:new Date().toISOString() }));
    await handle.close();
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const lock = JSON.parse(await readFile(path, 'utf8'));
      if (Date.now() - new Date(lock.startedAt).getTime() > staleMs) {
        await unlink(path);
        return acquireScanLock(path, staleMs);
      }
    } catch { return false; }
    return false;
  }
}

export async function releaseScanLock(path) {
  try { await unlink(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
