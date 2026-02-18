import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "divorce-ledger-offline";
const DB_VERSION = 1;

export interface SyncQueueItem {
  id: string;
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  body: unknown;
  headers: Record<string, string>;
  timestamp: number;
  retryCount: number;
  description: string;
}

type OfflineDBSchema = {
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: { "by-timestamp": number };
  };
};

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("syncQueue")) {
          const store = db.createObjectStore("syncQueue", { keyPath: "id" });
          store.createIndex("by-timestamp", "timestamp");
        }
      },
    });
  }
  return dbPromise;
}

export async function addToSyncQueue(
  item: Omit<SyncQueueItem, "id" | "timestamp" | "retryCount">
): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const queueItem: SyncQueueItem = {
    ...item,
    id,
    timestamp: Date.now(),
    retryCount: 0,
  };
  await db.add("syncQueue", queueItem);
  return id;
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAllFromIndex("syncQueue", "by-timestamp");
}

export async function getSyncQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count("syncQueue");
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("syncQueue", id);
}

export async function incrementRetryCount(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("syncQueue", "readwrite");
  const item = await tx.store.get(id);
  if (item) {
    item.retryCount += 1;
    await tx.store.put(item);
  }
  await tx.done;
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDB();
  await db.clear("syncQueue");
}
