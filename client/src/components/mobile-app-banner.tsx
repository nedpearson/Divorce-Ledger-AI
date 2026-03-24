import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, X, ExternalLink, QrCode, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';

// The mobile app URL — points to the /mobile route on the same host.
// In production this works perfectly. On localhost, phones can't reach the
// dev server, so we detect that case and warn the user.
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

function getMobileUrl(): string {
  const envUrl = import.meta.env.VITE_PUBLIC_URL || import.meta.env.VITE_SUPABASE_URL;
  if (envUrl) return `${envUrl.replace(/\/$/, '')}/mobile`;

  const { protocol, hostname, port } = window.location;
  const portPart = port ? `:${port}` : '';
  return `${protocol}//${hostname}${portPart}/api/mobile/pair`; // Change from /mobile directly, logic appends token later
}

function isLocalhost(): boolean {
  // Always return false so the QR code generates on localhost for the user
  return false;
}

// ─── Compact header button + popover ────────────────────────────────────────

export function MobileAppHeaderButton() {
  const [open, setOpen] = useState(false);
  const baseUrl = getMobileUrl();
  const local = isLocalhost();

  const { data: pairingData, isLoading } = useQuery({
    queryKey: ['mobile-pairing-token'],
    queryFn: async () => {
      const res = await fetch('/api/mobile/pairing-token', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate pairing token');
      return res.json();
    },
    enabled: open && !local,
    refetchInterval: 4 * 60 * 1000, // Refresh every 4m to ensure unexpired token
  });

  const mobileUrl = pairingData?.token ? `${baseUrl}?token=${pairingData.token}` : baseUrl;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Open mobile app"
          aria-label="Open mobile app"
          data-testid="button-mobile-app"
          className="relative"
        >
          <Smartphone className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-64 p-4 shadow-xl">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-sm leading-tight">Mobile App</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {local ? 'Not available on localhost' : 'Scan or tap to open on your phone'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mr-1 -mt-1"
            onClick={() => setOpen(false)}
            aria-label="Close mobile app popover"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>

        {local ? (
          /* ── Localhost warning ── */
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <WifiOff className="h-4 w-4 shrink-0" />
              <p className="text-xs font-medium">QR code unavailable locally</p>
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 leading-snug">
              Your phone can't reach <code className="font-mono">localhost</code>. To test on
              mobile, deploy the app or set <code className="font-mono">VITE_PUBLIC_URL</code> in
              your <code className="font-mono">.env</code> to your network IP or an ngrok URL.
            </p>
            <a
              href={mobileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open on this device
            </a>
          </div>
        ) : (
          <>
            {/* QR Code */}
            <div className="flex justify-center bg-white rounded-lg p-3 mb-2 border min-h-[160px] items-center">
              {isLoading ? (
                <div className="text-xs text-muted-foreground animate-pulse">Generating Secure Link...</div>
              ) : (
                <QRCodeSVG value={mobileUrl} size={160} level="M" includeMargin={false} />
              )}
            </div>

            {/* Direct link */}
            <a
              href={mobileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full text-xs text-primary hover:underline"
              aria-label="Open mobile view"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              Open mobile view
            </a>

            <p className="text-center text-[10px] text-muted-foreground mt-2 leading-snug">
              Works on any smartphone browser — no app store required
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Full card variant for signup / onboarding ───────────────────────────────

export function MobileAppSignupCard({ onDismiss }: { onDismiss?: () => void }) {
  const baseUrl = getMobileUrl();
  const local = isLocalhost();

  const { data: pairingData, isLoading } = useQuery({
    queryKey: ['mobile-pairing-token', 'signup-card'],
    queryFn: async () => {
      const res = await fetch('/api/mobile/pairing-token', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate pairing token');
      return res.json();
    },
    enabled: !local,
    refetchInterval: 4 * 60 * 1000, 
  });

  const mobileUrl = pairingData?.token ? `${baseUrl}?token=${pairingData.token}` : baseUrl;

  return (
    <Card className="border-primary/30 bg-primary/5 mt-4">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-primary rounded-md">
            <Smartphone className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Get the Mobile App</p>
            <p className="text-xs text-muted-foreground">
              Capture receipts &amp; violations on the go
            </p>
          </div>
          {onDismiss && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={onDismiss}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {local ? (
          /* ── Localhost warning ── */
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <WifiOff className="h-4 w-4 shrink-0" />
              <p className="text-xs font-medium">QR code unavailable locally</p>
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 leading-snug">
              Your phone can't reach <code className="font-mono">localhost</code>. Deploy the app or
              set <code className="font-mono">VITE_PUBLIC_URL</code> in your{' '}
              <code className="font-mono">.env</code> to enable QR codes.
            </p>
            <a
              href={mobileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open on this device
            </a>
          </div>
        ) : (
          <div className="flex gap-4 items-center">
            {/* QR Code */}
            <div className="bg-white rounded-lg p-2 border shrink-0 min-h-[96px] min-w-[96px] flex items-center justify-center">
              {isLoading ? (
                <div className="text-[10px] text-muted-foreground text-center">Loading...</div>
              ) : (
                <QRCodeSVG value={mobileUrl} size={96} level="M" includeMargin={false} />
              )}
            </div>

            {/* Instructions + link */}
            <div className="space-y-2 flex-1">
              <div className="flex items-start gap-1.5">
                <QrCode className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Scan the QR code with your phone's camera
                </p>
              </div>
              <div className="flex items-start gap-1.5">
                <Smartphone className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Or open the link directly in your mobile browser
                </p>
              </div>
              <a
                href={mobileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open mobile app
              </a>
            </div>
          </div>
        )}

        {!local && (
          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            No download needed — works instantly in any smartphone browser
          </p>
        )}
      </CardContent>
    </Card>
  );
}
