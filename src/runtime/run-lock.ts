import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface RunLockRecord {
  lockKey: string;
  createdAt: string;
  expiresAt: string;
  runId: string;
}

export interface AcquireRunLockResult {
  acquired: boolean;
  lockPath: string;
  record?: RunLockRecord;
  existing?: RunLockRecord;
}

function sanitizeLockKey(lockKey: string): string {
  return lockKey.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildRunLockPath(lockRootDir: string, lockKey: string): string {
  return join(lockRootDir, `${sanitizeLockKey(lockKey)}.json`);
}

async function readLockRecord(lockPath: string): Promise<RunLockRecord | null> {
  try {
    const raw = await readFile(lockPath, "utf8");
    return JSON.parse(raw) as RunLockRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function acquireRunLock(input: {
  lockPath: string;
  lockKey: string;
  runId: string;
  now?: Date;
  ttlMs?: number;
}): Promise<AcquireRunLockResult> {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 26 * 60 * 60 * 1000;
  const nextRecord: RunLockRecord = {
    lockKey: input.lockKey,
    runId: input.runId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  await mkdir(dirname(input.lockPath), { recursive: true });

  const existing = await readLockRecord(input.lockPath);
  if (existing) {
    const existingExpiresAt = new Date(existing.expiresAt).getTime();
    if (Number.isFinite(existingExpiresAt) && existingExpiresAt > now.getTime()) {
      return { acquired: false, lockPath: input.lockPath, existing };
    }
  }

  await writeFile(input.lockPath, JSON.stringify(nextRecord, null, 2), "utf8");
  return { acquired: true, lockPath: input.lockPath, record: nextRecord };
}

export async function releaseRunLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
