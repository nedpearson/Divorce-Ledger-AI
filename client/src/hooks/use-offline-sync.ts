import { useState, useEffect, useCallback, useRef } from "react";
import { addToSyncQueue, getSyncQueueCount } from "@/lib/offline-db";
import { syncOfflineChanges, type SyncResult } from "@/lib/sync";

// Captured once — the beforeinstallprompt event fires only once per session
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface UseOfflineSyncReturn {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  sync: () => Promise<SyncResult>;
  isInstallable: boolean;
  installApp: () => Promise<void>;
  queueMutation: (params: {
    method: "POST" | "PATCH" | "DELETE";
    url: string;
    body?: unknown;
    description: string;
  }) => Promise<string>;
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [isInstallable, setIsInstallable] = useState(!!deferredInstallPrompt);
  const isSyncingRef = useRef(false);

  // ── Refresh pending count from IndexedDB ──────────────────────────────────
  const refreshPendingCount = useCallback(async () => {
    const count = await getSyncQueueCount();
    setPendingCount(count);
  }, []);

  // ── Online / offline listeners ─────────────────────────────────────────────
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ── PWA install prompt ─────────────────────────────────────────────────────
  useEffect(() => {
    const onInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setIsInstallable(true);
    };
    const onInstalled = () => {
      deferredInstallPrompt = null;
      setIsInstallable(false);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // ── Poll pending count ─────────────────────────────────────────────────────
  useEffect(() => {
    refreshPendingCount();
    const id = setInterval(refreshPendingCount, 30_000);
    return () => clearInterval(id);
  }, [refreshPendingCount]);

  // ── Listen for SW cache-update messages ───────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "API_CACHE_UPDATED") {
        // SW just stored fresh data — good time to refresh counts
        refreshPendingCount();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [refreshPendingCount]);

  // ── Sync ──────────────────────────────────────────────────────────────────
  const sync = useCallback(async (): Promise<SyncResult> => {
    if (isSyncingRef.current || !navigator.onLine) {
      return { flushed: 0, failed: 0, errors: [] };
    }
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const result = await syncOfflineChanges();
      setLastSyncResult(result);
      await refreshPendingCount();
      return result;
    } catch (err) {
      const result: SyncResult = {
        flushed: 0,
        failed: 0,
        errors: [err instanceof Error ? err.message : "Unknown sync error"],
      };
      setLastSyncResult(result);
      return result;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshPendingCount]);

  // ── Install app ───────────────────────────────────────────────────────────
  const installApp = useCallback(async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") {
      deferredInstallPrompt = null;
      setIsInstallable(false);
    }
  }, []);

  // ── Queue a mutation for later sync ──────────────────────────────────────
  const queueMutation = useCallback(
    async (params: {
      method: "POST" | "PATCH" | "DELETE";
      url: string;
      body?: unknown;
      description: string;
    }): Promise<string> => {
      // Capture auth headers from localStorage (mirrors queryClient.ts behaviour)
      const headers: Record<string, string> = {};
      try {
        const userStr = localStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr) as { id?: string };
          if (user?.id) headers["X-User-Id"] = user.id;
        }
        const env = localStorage.getItem("environment");
        if (env) headers["X-Environment"] = env;
      } catch {
        // ignore parse errors
      }

      const id = await addToSyncQueue({
        method: params.method,
        url: params.url,
        body: params.body,
        headers,
        description: params.description,
      });
      await refreshPendingCount();
      return id;
    },
    [refreshPendingCount]
  );

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncResult,
    sync,
    isInstallable,
    installApp,
    queueMutation,
  };
}
