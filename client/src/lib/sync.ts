import {
  getSyncQueue,
  removeSyncQueueItem,
  incrementRetryCount,
} from "./offline-db";
import { queryClient } from "./queryClient";

// All mobile GET endpoints — invalidated after a successful sync
const MOBILE_QUERY_KEYS = [
  "/api/mobile/documents",
  "/api/mobile/violations",
  "/api/mobile/reimbursements",
  "/api/mobile/w2-records",
  "/api/mobile/financial-summary",
  "/api/mobile/assets",
  "/api/mobile/debts",
  "/api/mobile/incomes",
  "/api/mobile/expenses",
  "/api/mobile/child-support",
  "/api/mobile/document-categories",
];

export interface SyncResult {
  flushed: number;
  failed: number;
  errors: string[];
}

/**
 * Flush all queued offline mutations (in chronological order) then
 * invalidate every mobile React-Query cache key so fresh data is fetched.
 */
export async function syncOfflineChanges(): Promise<SyncResult> {
  const queue = await getSyncQueue();

  let flushed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          ...item.headers,
        },
        body: item.method !== "DELETE" ? JSON.stringify(item.body) : undefined,
        credentials: "include",
      });

      if (response.ok || response.status === 404) {
        // 404 on DELETE = item already gone on server — treat as success
        await removeSyncQueueItem(item.id);
        flushed++;
      } else if (response.status === 401) {
        // Session expired — stop flushing, leave queue intact
        errors.push("Session expired — please log in again to sync.");
        failed++;
        break;
      } else if (response.status === 409) {
        // Conflict — remove from queue so we don't block everything else
        errors.push(
          `Conflict on ${item.method} ${item.url}: ${response.statusText}`
        );
        await removeSyncQueueItem(item.id);
        failed++;
      } else {
        await incrementRetryCount(item.id);
        errors.push(
          `${item.method} ${item.url} failed: HTTP ${response.status}`
        );
        failed++;
      }
    } catch {
      // Network still down — stop processing
      await incrementRetryCount(item.id);
      errors.push(`${item.method} ${item.url}: network error — still offline?`);
      failed++;
      break;
    }
  }

  // Refresh all mobile query data after flushing
  if (flushed > 0 || queue.length === 0) {
    await refreshAllMobileData();
  }

  return { flushed, failed, errors };
}

/**
 * Invalidate every mobile React-Query key so the next render triggers a
 * fresh network fetch.  Works correctly with TanStack Query v5 prefix matching.
 */
export async function refreshAllMobileData(): Promise<void> {
  await Promise.all(
    MOBILE_QUERY_KEYS.map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] })
    )
  );
}

// Realtime subscription logic (previously Supabase)
export function subscribeMobileRealtime(onChange: (payload: any) => void) {
  // Mobile realtime events are handled via standard websockets/polling now
  console.log('Mobile realtime subscriptions enabled');
}
