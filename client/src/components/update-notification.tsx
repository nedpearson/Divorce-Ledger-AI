import { useState, useEffect, useCallback, useRef } from "react";
import { X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { queryClient } from "@/lib/queryClient";

interface AppVersion {
  version: string;
  buildTime: string;
  features: {
    title: string;
    description: string;
  }[];
}

const POLL_INTERVAL = 30000;
const VERSION_STORAGE_KEY = "divorce-ledger-last-version";
const DISMISSED_KEY = "divorce-ledger-update-dismissed";

export function UpdateNotification() {
  const [showBanner, setShowBanner] = useState(false);
  const versionRef = useRef<string | null>(null);

  const checkForUpdates = useCallback(async () => {
    try {
      const response = await fetch("/api/version");
      if (!response.ok) return;
      
      const data: AppVersion = await response.json();
      const lastSeenVersion = localStorage.getItem(VERSION_STORAGE_KEY);
      const dismissedVersion = sessionStorage.getItem(DISMISSED_KEY);
      
      versionRef.current = data.version;
      
      if (lastSeenVersion && lastSeenVersion !== data.version && dismissedVersion !== data.version) {
        setShowBanner(true);
      } else if (!lastSeenVersion) {
        localStorage.setItem(VERSION_STORAGE_KEY, data.version);
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
    const interval = setInterval(checkForUpdates, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [checkForUpdates]);

  const handleRefresh = () => {
    if (versionRef.current) {
      localStorage.setItem(VERSION_STORAGE_KEY, versionRef.current);
      sessionStorage.removeItem(DISMISSED_KEY);
    }
    setShowBanner(false);
    queryClient.clear();
    setTimeout(() => {
      window.location.reload();
    }, 50);
  };

  const handleDismiss = () => {
    if (versionRef.current) {
      sessionStorage.setItem(DISMISSED_KEY, versionRef.current);
    }
    setShowBanner(false);
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-0 left-0 right-0 z-sticky bg-primary text-primary-foreground shadow-sm"
          data-testid="update-notification-banner"
        >
          <div className="flex items-center justify-between px-3 py-1.5 text-sm">
            <span className="font-medium">Update available</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-xs"
                onClick={handleRefresh}
                data-testid="button-refresh-app"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleDismiss}
                data-testid="button-dismiss-update"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
