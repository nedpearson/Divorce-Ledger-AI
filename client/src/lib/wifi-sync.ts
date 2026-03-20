/**
 * WiFi Sync Service
 *
 * Automatically syncs offline data when on the same network as the desktop
 * Uses local network discovery and background sync
 */

import {
  getUnsyncedDocuments,
  getUnsyncedViolations,
  markDocumentSynced,
  markViolationSynced,
  setSyncMetadata,
  getSyncMetadata,
  getSyncQueue,
  removeSyncQueueItem,
  type OfflineDocument,
  type OfflineViolation,
} from './offline-db';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  pendingCount: number;
  error: string | null;
}

export interface SyncResult {
  success: boolean;
  documentsSynced: number;
  violationsSynced: number;
  queueItemsSynced: number;
  errors: string[];
}

let syncInProgress = false;
let syncStatus: SyncStatus = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSyncTime: null,
  pendingCount: 0,
  error: null,
};

let statusListeners: Array<(status: SyncStatus) => void> = [];

// ============================================================================
// NETWORK DETECTION
// ============================================================================

/**
 * Detect if we're on the same network as the desktop
 * Uses a simple ping to the server to check connectivity
 */
async function isOnSameNetwork(): Promise<boolean> {
  try {
    // Try to reach the server
    const response = await fetch('/api/health', {
      method: 'GET',
      headers: { 'X-Sync-Check': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the server URL for syncing (local network or configured URL)
 */
async function getServerUrl(): Promise<string> {
  // Try localStorage first
  const stored = localStorage.getItem('sync-server-url');
  if (stored) return stored;

  // Try to detect from current origin
  if (window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('192.168')) {
    return window.location.origin;
  }

  // Default to localhost in development
  return 'http://localhost:5000';
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * Sync a single offline document to the server
 */
async function syncDocument(doc: OfflineDocument): Promise<boolean> {
  try {
    const serverUrl = await getServerUrl();
    const formData = new FormData();

    formData.append('file', doc.fileData, doc.fileName);
    formData.append('title', doc.title);
    formData.append('category', doc.category);
    formData.append('timestamp', doc.timestamp.toString());

    const response = await fetch(`${serverUrl}/api/documents`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (response.ok) {
      await markDocumentSynced(doc.id);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[WiFi Sync] Failed to sync document:', error);
    return false;
  }
}

/**
 * Sync a single offline violation to the server
 */
async function syncViolation(violation: OfflineViolation): Promise<boolean> {
  try {
    const serverUrl = await getServerUrl();
    const formData = new FormData();

    formData.append('type', violation.type);
    formData.append('description', violation.description);
    formData.append('timestamp', violation.timestamp.toString());

    if (violation.location) {
      formData.append('location', JSON.stringify(violation.location));
    }

    // Attach media files
    violation.mediaFiles.forEach((media, index) => {
      formData.append(`media_${index}`, media.blob, media.name);
    });

    const response = await fetch(`${serverUrl}/api/violations`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (response.ok) {
      await markViolationSynced(violation.id);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[WiFi Sync] Failed to sync violation:', error);
    return false;
  }
}

/**
 * Sync queued mutations (PATCH/DELETE operations)
 */
async function syncQueuedMutations(): Promise<number> {
  const queue = await getSyncQueue();
  let synced = 0;

  for (const item of queue) {
    try {
      const serverUrl = await getServerUrl();
      const response = await fetch(`${serverUrl}${item.url}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          ...item.headers,
        },
        body: item.body ? JSON.stringify(item.body) : undefined,
        credentials: 'include',
      });

      if (response.ok) {
        await removeSyncQueueItem(item.id);
        synced++;
      }
    } catch (error) {
      console.error('[WiFi Sync] Failed to sync queue item:', error);
    }
  }

  return synced;
}

/**
 * Main sync function - syncs all offline data
 */
export async function syncOfflineData(): Promise<SyncResult> {
  if (syncInProgress) {
    return {
      success: false,
      documentsSynced: 0,
      violationsSynced: 0,
      queueItemsSynced: 0,
      errors: ['Sync already in progress'],
    };
  }

  const result: SyncResult = {
    success: true,
    documentsSynced: 0,
    violationsSynced: 0,
    queueItemsSynced: 0,
    errors: [],
  };

  try {
    syncInProgress = true;
    updateStatus({ isSyncing: true, error: null });

    // Check if we're on the same network
    const canSync = await isOnSameNetwork();
    if (!canSync) {
      result.success = false;
      result.errors.push('Not on the same network as desktop');
      updateStatus({ error: 'Not connected to desktop network' });
      return result;
    }

    // Sync documents
    const unsyncedDocs = await getUnsyncedDocuments();
    for (const doc of unsyncedDocs) {
      if (await syncDocument(doc)) {
        result.documentsSynced++;
      } else {
        result.errors.push(`Failed to sync document: ${doc.title}`);
      }
    }

    // Sync violations
    const unsyncedViols = await getUnsyncedViolations();
    for (const viol of unsyncedViols) {
      if (await syncViolation(viol)) {
        result.violationsSynced++;
      } else {
        result.errors.push(`Failed to sync violation: ${viol.type}`);
      }
    }

    // Sync queued mutations
    result.queueItemsSynced = await syncQueuedMutations();

    // Update metadata
    await setSyncMetadata({
      lastSyncTimestamp: Date.now(),
      serverUrl: await getServerUrl(),
      pendingCount: 0,
    });

    updateStatus({
      lastSyncTime: Date.now(),
      pendingCount: 0,
      error: null,
    });
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    updateStatus({ error: 'Sync failed' });
  } finally {
    syncInProgress = false;
    updateStatus({ isSyncing: false });
  }

  return result;
}

// ============================================================================
// AUTO-SYNC MANAGEMENT
// ============================================================================

let autoSyncInterval: number | null = null;

/**
 * Start automatic syncing when on WiFi
 * Checks every 30 seconds if on same network and syncs if needed
 */
export function startAutoSync(intervalMs: number = 30000): void {
  if (autoSyncInterval) return;

  console.log('[WiFi Sync] Auto-sync started');

  // Initial sync attempt
  setTimeout(() => syncOfflineData(), 2000);

  // Set up interval
  autoSyncInterval = window.setInterval(async () => {
    if (!syncInProgress && navigator.onLine) {
      const metadata = await getSyncMetadata();
      const unsyncedDocs = await getUnsyncedDocuments();
      const unsyncedViols = await getUnsyncedViolations();
      const queue = await getSyncQueue();

      const pendingCount = unsyncedDocs.length + unsyncedViols.length + queue.length;

      if (pendingCount > 0) {
        console.log(`[WiFi Sync] ${pendingCount} items pending, attempting sync...`);
        await syncOfflineData();
      }
    }
  }, intervalMs);

  // Listen to online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
}

/**
 * Stop automatic syncing
 */
export function stopAutoSync(): void {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    console.log('[WiFi Sync] Auto-sync stopped');
  }
}

function handleOnline() {
  updateStatus({ isOnline: true });
  // Attempt sync after coming back online
  setTimeout(() => syncOfflineData(), 1000);
}

function handleOffline() {
  updateStatus({ isOnline: false, error: 'Device offline' });
}

// ============================================================================
// STATUS MANAGEMENT
// ============================================================================

function updateStatus(updates: Partial<SyncStatus>): void {
  syncStatus = { ...syncStatus, ...updates };
  statusListeners.forEach((listener) => listener(syncStatus));
}

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

export function onSyncStatusChange(listener: (status: SyncStatus) => void): () => void {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}

// ============================================================================
// MANUAL SERVER CONFIGURATION
// ============================================================================

/**
 * Manually set the server URL for syncing
 */
export function setServerUrl(url: string): void {
  localStorage.setItem('sync-server-url', url);
}

/**
 * Get the configured server URL
 */
export function getConfiguredServerUrl(): string | null {
  return localStorage.getItem('sync-server-url');
}

/**
 * Clear server URL configuration
 */
export function clearServerUrl(): void {
  localStorage.removeItem('sync-server-url');
}

// Initialize on load
if (typeof window !== 'undefined') {
  // Start auto-sync if we have offline data
  (async () => {
    try {
      const unsyncedDocs = await getUnsyncedDocuments();
      const unsyncedViols = await getUnsyncedViolations();
      if (unsyncedDocs.length > 0 || unsyncedViols.length > 0) {
        startAutoSync();
      }
    } catch (error) {
      console.error('[WiFi Sync] Initialization error:', error);
      // Don't break the app if sync initialization fails
    }
  })();

  // Listen for messages from service worker
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data.type === 'BACKGROUND_SYNC_START') {
      console.log('[WiFi Sync] Background sync triggered by service worker');
      syncOfflineData();
    }
  });
}

/**
 * Register for background sync
 * This allows the service worker to trigger sync when the device comes back online
 */
export async function registerBackgroundSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.log('[WiFi Sync] Service Worker not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    // Background Sync API is not in TypeScript types yet, use type assertion
    if ('sync' in registration) {
      await (registration as any).sync.register('sync-offline-data');
      console.log('[WiFi Sync] Background sync registered');
    } else {
      console.log('[WiFi Sync] Background Sync API not supported');
    }
  } catch (error) {
    console.error('[WiFi Sync] Failed to register background sync:', error);
  }
}

/**
 * Trigger background sync after saving offline data
 * Call this after saving documents or violations offline
 */
export function triggerBackgroundSync(): void {
  registerBackgroundSync();
}
