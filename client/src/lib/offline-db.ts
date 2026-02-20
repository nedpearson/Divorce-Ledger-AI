import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "divorce-ledger-offline";
const DB_VERSION = 2; // Bumped for new stores

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

export interface OfflineDocument {
  id: string;
  title: string;
  category: string;
  fileData: Blob;
  fileName: string;
  mimeType: string;
  timestamp: number;
  synced: boolean;
  localOnly: boolean;
}

export interface OfflineViolation {
  id: string;
  type: string;
  description: string;
  mediaFiles: { blob: Blob; type: string; name: string }[];
  timestamp: number;
  location?: { lat: number; lng: number };
  synced: boolean;
  localOnly: boolean;
}

export interface SyncMetadata {
  lastSyncTimestamp: number;
  serverUrl: string;
  pendingCount: number;
}

type OfflineDBSchema = {
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: { "by-timestamp": number };
  };
  documents: {
    key: string;
    value: OfflineDocument;
    indexes: { "by-synced": boolean; "by-timestamp": number };
  };
  violations: {
    key: string;
    value: OfflineViolation;
    indexes: { "by-synced": boolean; "by-timestamp": number };
  };
  syncMetadata: {
    key: string;
    value: SyncMetadata;
  };
};

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Sync Queue
        if (!db.objectStoreNames.contains("syncQueue")) {
          const store = db.createObjectStore("syncQueue", { keyPath: "id" });
          store.createIndex("by-timestamp", "timestamp");
        }
        
        // Documents Store
        if (!db.objectStoreNames.contains("documents")) {
          const docStore = db.createObjectStore("documents", { keyPath: "id" });
          docStore.createIndex("by-synced", "synced");
          docStore.createIndex("by-timestamp", "timestamp");
        }
        
        // Violations Store
        if (!db.objectStoreNames.contains("violations")) {
          const violStore = db.createObjectStore("violations", { keyPath: "id" });
          violStore.createIndex("by-synced", "synced");
          violStore.createIndex("by-timestamp", "timestamp");
        }
        
        // Sync Metadata
        if (!db.objectStoreNames.contains("syncMetadata")) {
          db.createObjectStore("syncMetadata", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// ============================================================================
// SYNC QUEUE OPERATIONS
// ============================================================================

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

// ============================================================================
// OFFLINE DOCUMENTS
// ============================================================================

export async function saveOfflineDocument(doc: Omit<OfflineDocument, "id" | "timestamp">): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const offlineDoc: OfflineDocument = {
    ...doc,
    id,
    timestamp: Date.now(),
  };
  await db.add("documents", offlineDoc);
  return id;
}

export async function getOfflineDocuments(): Promise<OfflineDocument[]> {
  const db = await getDB();
  return db.getAllFromIndex("documents", "by-timestamp");
}

export async function getUnsyncedDocuments(): Promise<OfflineDocument[]> {
  const db = await getDB();
  const allDocs = await db.getAllFromIndex("documents", "by-synced");
  return allDocs.filter(doc => !doc.synced);
}

export async function markDocumentSynced(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("documents", "readwrite");
  const doc = await tx.store.get(id);
  if (doc) {
    doc.synced = true;
    await tx.store.put(doc);
  }
  await tx.done;
}

export async function deleteOfflineDocument(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("documents", id);
}

// ============================================================================
// OFFLINE VIOLATIONS
// ============================================================================

export async function saveOfflineViolation(violation: Omit<OfflineViolation, "id" | "timestamp">): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const offlineViolation: OfflineViolation = {
    ...violation,
    id,
    timestamp: Date.now(),
  };
  await db.add("violations", offlineViolation);
  return id;
}

export async function getOfflineViolations(): Promise<OfflineViolation[]> {
  const db = await getDB();
  return db.getAllFromIndex("violations", "by-timestamp");
}

export async function getUnsyncedViolations(): Promise<OfflineViolation[]> {
  const db = await getDB();
  const allViols = await db.getAllFromIndex("violations", "by-synced");
  return allViols.filter(viol => !viol.synced);
}

export async function markViolationSynced(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("violations", "readwrite");
  const viol = await tx.store.get(id);
  if (viol) {
    viol.synced = true;
    await tx.store.put(viol);
  }
  await tx.done;
}

export async function deleteOfflineViolation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("violations", id);
}

// ============================================================================
// SYNC METADATA
// ============================================================================

export async function setSyncMetadata(metadata: Partial<SyncMetadata>): Promise<void> {
  const db = await getDB();
  const existing = await db.get("syncMetadata", "sync") || {
    lastSyncTimestamp: 0,
    serverUrl: "",
    pendingCount: 0,
  };
  await db.put("syncMetadata", { key: "sync", ...existing, ...metadata });
}

export async function getSyncMetadata(): Promise<SyncMetadata | undefined> {
  const db = await getDB();
  return db.get("syncMetadata", "sync");
}

// ============================================================================
// STORAGE INFO
// ============================================================================

export async function getStorageInfo(): Promise<{
  documents: number;
  violations: number;
  queueItems: number;
  unsyncedDocs: number;
  unsyncedViols: number;
}> {
  const db = await getDB();
  const documents = await db.count("documents");
  const violations = await db.count("violations");
  const queueItems = await db.count("syncQueue");
  const unsyncedDocs = (await getUnsyncedDocuments()).length;
  const unsyncedViols = (await getUnsyncedViolations()).length;
  
  return { documents, violations, queueItems, unsyncedDocs, unsyncedViols };
}

export async function clearAllOfflineData(): Promise<void> {
  const db = await getDB();
  await db.clear("syncQueue");
  await db.clear("documents");
  await db.clear("violations");
  await db.clear("syncMetadata");
}

