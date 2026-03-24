import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Smartphone, Wifi, Download, CheckCircle2, Copy } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';

/**
 * Mobile Install Page
 *
 * Displays QR code for mobile app installation with secure pairing
 * Shows instructions for installing PWA and syncing offline data
 */
export default function MobileInstallPage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [localIp, setLocalIp] = useState<string | null>(null);

  const { data: pairingData, isLoading } = useQuery({
    queryKey: ['mobile-pairing-token', 'full-page'],
    queryFn: async () => {
      const res = await fetch('/api/mobile/pairing-token', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate pairing token');
      return res.json();
    },
    // Keep it fresh so the QR code doesn't magically expire before they scan it
    refetchInterval: 4 * 60 * 1000, 
  });

  const installUrl = pairingData?.token && baseUrl ? `${baseUrl}?token=${pairingData.token}` : baseUrl;

  useEffect(() => {
    // Try to get local IP first
    detectLocalIp();
  }, []);

  const detectLocalIp = async () => {
    try {
      const response = await fetch('/api/network-info');
      if (response.ok) {
        const data = await response.json();
        if (data.localIp) {
          // Use local IP address for mobile access
          const port = data.port || '5000';
          // Change to /api/mobile/pair endpoint
          const url = `http://${data.localIp}:${port}/api/mobile/pair`;
          setBaseUrl(url);
          setLocalIp(data.localIp);
          return;
        }
      }
    } catch (error) {
      console.error('Failed to get network info:', error);
    }

    // Fallback: use current origin
    const url = `${window.location.origin}/api/mobile/pair`;
    setBaseUrl(url);

    // Check if we're already on a local IP
    if (
      window.location.hostname.startsWith('192.168') ||
      window.location.hostname.startsWith('10.') ||
      window.location.hostname.startsWith('172.')
    ) {
      setLocalIp(window.location.hostname);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(installUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">Install Mobile App</h1>
          <p className="text-lg text-gray-600">Simple evidence capture: Camera + Voice Notes</p>
          <p className="text-sm text-gray-500">
            Scan the QR code to install. Works offline, syncs on WiFi.
          </p>
        </div>

        {/* QR Code Card */}
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Scan to Install
            </CardTitle>
            <CardDescription>
              Opens directly to Quick Capture with camera and voice options
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            {installUrl && baseUrl && (
              <div className="bg-white p-8 rounded-lg shadow-inner min-h-[256px] flex items-center justify-center">
                {isLoading ? (
                  <div className="text-sm text-muted-foreground animate-pulse">Generating Secure Profile Link...</div>
                ) : (
                  <QRCodeSVG value={installUrl} size={256} level="H" includeMargin={true} />
                )}
              </div>
            )}

            <div className="flex items-center gap-2 w-full max-w-md">
              <input
                type="text"
                value={installUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-gray-50"
              />
              <Button onClick={copyToClipboard} variant="outline" size="sm">
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            {installUrl.includes('localhost') && (
              <div className="w-full max-w-md p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-xs text-yellow-800">
                  ⚠️ <strong>Note:</strong> This URL uses "localhost" which won't work on your
                  phone. Please access this page using your computer's IP address (like
                  http://192.168.1.x:5000/mobile-install) instead of localhost.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-2">
                <span className="text-2xl font-bold text-blue-600">1</span>
              </div>
              <CardTitle className="text-lg">Scan QR Code</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Open your phone's camera app and point it at the QR code above. Tap the notification
                to open the link.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-2">
                <span className="text-2xl font-bold text-green-600">2</span>
              </div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Download className="h-4 w-4" />
                Install App
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Tap "Add to Home Screen" or "Install" when prompted. The app will be added to your
                phone like a native app.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 mb-2">
                <span className="text-2xl font-bold text-purple-600">3</span>
              </div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                Capture Evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Use camera to scan documents, voice notes to describe violations. Everything saves
                locally and syncs automatically on WiFi.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Network Info */}
        {localIp ? (
          <Alert>
            <Wifi className="h-4 w-4" />
            <AlertDescription>
              <strong>Desktop IP:</strong> {localIp}
              <br />
              <span className="text-sm text-muted-foreground">
                Make sure your phone is connected to the same WiFi network to access the app.
              </span>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <Wifi className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Connect your phone to the same WiFi network as this
              computer.
              <br />
              <span className="text-sm text-muted-foreground">
                If the QR code doesn't work, manually enter the URL on your phone using your
                computer's local IP address.
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* Platform-Specific Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Installation Instructions by Device</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">📱 iPhone / iPad (Safari)</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Open the link in Safari browser</li>
                <li>Tap the Share button (square with arrow)</li>
                <li>Scroll down and tap "Add to Home Screen"</li>
                <li>Tap "Add" in the top right</li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-2">🤖 Android (Chrome)</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Open the link in Chrome browser</li>
                <li>Tap the menu (three dots) in the top right</li>
                <li>Tap "Install app" or "Add to Home screen"</li>
                <li>Tap "Install" when prompted</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-900">
              🔧 Troubleshooting "Unreachable" Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <h4 className="font-semibold text-orange-900 mb-2">
                If you see "localhost unreachable":
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-orange-800">
                <li>
                  <strong>Find Your Computer's IP Address:</strong>
                  <ul className="ml-6 mt-1 space-y-1 list-disc">
                    <li>
                      <strong>Windows:</strong> Open Command Prompt → type{' '}
                      <code className="bg-white px-1 rounded">ipconfig</code> → look for "IPv4
                      Address" (like 192.168.1.x)
                    </li>
                    <li>
                      <strong>Mac:</strong> System Preferences → Network → look for "IP Address"
                    </li>
                  </ul>
                </li>
                <li>
                  <strong>Access this page using your IP:</strong> Open{' '}
                  <code className="bg-white px-1 rounded">http://YOUR-IP:5000/mobile-install</code>{' '}
                  (example: http://192.168.1.100:5000/mobile-install)
                </li>
                <li>
                  <strong>Scan the new QR code</strong> that appears with your actual IP address
                </li>
                <li>
                  <strong>Verify WiFi:</strong> Make sure your phone and computer are on the{' '}
                  <strong>same WiFi network</strong>
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
          <CardHeader>
            <CardTitle>Simple Mobile Capture</CardTitle>
            <CardDescription>Two easy ways to capture evidence on your phone</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Documents */}
              <div className="bg-white/80 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  📄 Capture Documents
                </h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      <strong>Camera:</strong> Take photos of financial statements, court orders,
                      receipts
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      <strong>Voice Notes:</strong> Speak to add descriptions - automatically
                      converted to text
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      <strong>Upload:</strong> Select files from your phone's gallery or files
                    </span>
                  </li>
                </ul>
              </div>

              {/* Violations */}
              <div className="bg-white/80 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  ⚠️ Report Violations
                </h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      <strong>Camera:</strong> Document custody violations, property damage,
                      incidents
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      <strong>Voice Notes:</strong> Describe what happened in your own words -
                      hands-free
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      <strong>Evidence Files:</strong> Attach photos, videos, or audio recordings
                    </span>
                  </li>
                </ul>
              </div>

              {/* Key Benefits */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200">
                <h4 className="font-semibold mb-2">Why It's Easy:</h4>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>App opens directly to Quick Capture screen</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Works offline - capture anytime, anywhere</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Auto-syncs when you're back on WiFi</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Voice-to-text saves typing on small screens</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
