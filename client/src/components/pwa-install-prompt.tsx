import { useState, useEffect } from 'react';
import { usePWAInstall } from '@/hooks/use-pwa-install';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, X, Smartphone } from 'lucide-react';

/**
 * PWA Install Prompt Component
 *
 * Shows a dismissible banner prompting users to install the app
 * Only shown on mobile devices when installation is available
 */
export function PWAInstallPrompt() {
  const { canInstall, promptInstall, isInstalled } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    try {
      // Check if on mobile
      const checkMobile = () => {
        const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
        const smallScreen = window.innerWidth < 768;
        setIsMobile(mobile || smallScreen);
      };

      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    } catch (error) {
      console.error('[PWA Install] Error in setup:', error);
      setHasError(true);
    }
  }, []);

  useEffect(() => {
    try {
      // Check if previously dismissed (within last 7 days)
      const dismissedAt = localStorage.getItem('pwa-install-dismissed');
      if (dismissedAt) {
        const dismissedTime = parseInt(dismissedAt);
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (dismissedTime > sevenDaysAgo) {
          setDismissed(true);
        }
      }
    } catch (error) {
      console.error('[PWA Install] Error checking dismissed status:', error);
    }
  }, []);

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (installed) {
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't show if:
  // - Already installed
  // - Can't install
  // - User dismissed it
  // - Not on mobile
  // - Has error
  if (isInstalled || !canInstall || dismissed || !isMobile || hasError) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96 animate-in slide-in-from-bottom-5">
      <Card className="shadow-lg border-2 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Install App</CardTitle>
                <CardDescription className="text-xs">
                  Works offline & syncs when connected
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleDismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-2">
            <Button onClick={handleInstall} size="sm" className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Install
            </Button>
            <Button variant="outline" size="sm" onClick={handleDismiss}>
              Later
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
