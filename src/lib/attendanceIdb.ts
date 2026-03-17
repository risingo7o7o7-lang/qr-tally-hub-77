import { openDB } from "idb";

const DB_NAME = "qr-tally";
const DB_VERSION = 1;

export type QueuedScan = {
  id: string;
  createdAt: string;
  studentId: string;
  qrToken: string;
  deviceFingerprint: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
};

export type SessionLock = {
  sessionId: string;
  studentId: string;
  lockedAt: string;
};

function getBackoffMs(attempts: number) {
  const schedule = [10_000, 30_000, 60_000, 5 * 60_000, 15 * 60_000];
  return schedule[Math.min(attempts, schedule.length - 1)];
}

export async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("queued_scans")) {
        const store = db.createObjectStore("queued_scans", { keyPath: "id" });
        store.createIndex("nextAttemptAt", "nextAttemptAt");
        store.createIndex("studentId", "studentId");
      }
      if (!db.objectStoreNames.contains("session_locks")) {
        db.createObjectStore("session_locks", { keyPath: "sessionId" });
      }
    },
  });
}

export async function putSessionLock(lock: SessionLock) {
  const db = await getDb();
  await db.put("session_locks", lock);
}

export async function getSessionLock(sessionId: string): Promise<SessionLock | undefined> {
  const db = await getDb();
  return db.get("session_locks", sessionId);
}

export async function queueScan(input: Omit<QueuedScan, "attempts" | "nextAttemptAt">) {
  const now = new Date();
  const firstAttemptAt = new Date(now.getTime() + getBackoffMs(0)).toISOString();
  const db = await getDb();
  const scan: QueuedScan = {
    ...input,
    attempts: 0,
    nextAttemptAt: firstAttemptAt,
  };
  await db.put("queued_scans", scan);
  return scan;
}

export async function listDueQueuedScans(nowIso: string): Promise<QueuedScan[]> {
  const db = await getDb();
  const idx = db.transaction("queued_scans").store.index("nextAttemptAt");
  const all = await idx.getAll();
  return all.filter((x) => x.nextAttemptAt <= nowIso);
}

export async function purgeQueuedScansOlderThan(maxAgeMs: number) {
  const db = await getDb();
  const all = await db.getAll("queued_scans") as QueuedScan[];
  const cutoff = Date.now() - maxAgeMs;
  const toDelete = all.filter((x) => new Date(x.createdAt).getTime() < cutoff).map((x) => x.id);
  for (const id of toDelete) await db.delete("queued_scans", id);
  return { purged: toDelete.length };
}

export async function updateQueuedScanAttempt(id: string, attempts: number, lastError?: string) {
  const db = await getDb();
  const current = await db.get("queued_scans", id) as QueuedScan | undefined;
  if (!current) return;
  const nextAttemptAt = new Date(Date.now() + getBackoffMs(attempts)).toISOString();
  await db.put("queued_scans", { ...current, attempts, nextAttemptAt, lastError });
}

export async function deleteQueuedScan(id: string) {
  const db = await getDb();
  await db.delete("queued_scans", id);
}

