/**
 * Tiny IndexedDB queue for clock-in/out submissions, so a clock made while
 * offline (bad signal on the move, or the app closed mid-submit) survives and is
 * re-sent when connectivity returns. Each queued item carries its own
 * `clientTime`, so the server records the real tap moment, not the sync moment.
 * The attendance write is idempotent, so replaying a queued item is safe.
 */

const DB_NAME = "treelogy-clock";
const STORE = "queue";

export interface QueuedClock {
  id: string;
  dir: "in" | "out";
  /** The exact POST body sent to /api/attendance/clock (includes clientTime + photo). */
  payload: unknown;
  /** Enqueued epoch ms — used to drop items too stale to record accurately. */
  at: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function enqueueClock(item: QueuedClock): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(item);
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });
  db.close();
}

export async function removeClock(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });
  db.close();
}

export async function allClocks(): Promise<QueuedClock[]> {
  const db = await openDb();
  if (!db) return [];
  const items = await new Promise<QueuedClock[]>((resolve) => {
    const t = db.transaction(STORE, "readonly");
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as QueuedClock[]) ?? []);
    req.onerror = () => resolve([]);
  });
  db.close();
  return items;
}
