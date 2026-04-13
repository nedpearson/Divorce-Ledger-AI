import { useLocation, Link } from 'wouter';
import { Home, FileText, AlertTriangle, DollarSign, Menu, Camera, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { icon: Home, label: 'Home', path: '/home' },
  { icon: FileText, label: 'Docs', path: '/documents' },
  { icon: AlertTriangle, label: 'Violations', path: '/violations' },
  { icon: DollarSign, label: 'Finances', path: '/finances' },
  { icon: Menu, label: 'More', path: '/more' },
];

interface MobileBottomNavProps {
  onCaptureClick?: () => void;
}

export function MobileBottomNav({ onCaptureClick }: MobileBottomNavProps) {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { environment } = useAuth();

  const isLive = environment?.startsWith('live');
  const isDemo = environment === 'demo';
  const isTest = environment?.startsWith('demo-test');

  const moreItems = [
    { label: 'Journal', path: '/journal' },
    { label: 'Messages', path: '/communications' },
    { label: 'Timeline', path: '/timeline' },
    { label: 'Case Builder', path: '/case-builder' },
    { label: 'Calendar', path: '/calendar' },
    { label: 'Legal', path: '/legal' },
    { label: 'Obligations', path: '/obligations' },
    { label: 'Property', path: '/property' },
    { label: 'AI Coach', path: '/ai-coach' },
    { label: 'Settings', path: '/settings' },
  ];

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-sticky bg-card/95 backdrop-blur-lg border-t border-border md:hidden safe-area-pb"
        data-testid="mobile-bottom-nav"
      >
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item, index) => {
            if (index === 2) {
              return (
                <button
                  key="capture"
                  onClick={onCaptureClick}
                  className="flex flex-col items-center justify-center -mt-6 group touch-target"
                  data-testid="button-capture-fab"
                >
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-lg shadow-primary/30 group-active:scale-95 transition-transform">
                    <Plus className="w-7 h-7 text-white" />
                  </div>
                </button>
              );
            }

            const isActive =
              item.path === '/more'
                ? moreOpen
                : location === item.path || location.startsWith(item.path + '/');

            if (item.path === '/more') {
              return (
                <button
                  key={item.path}
                  onClick={() => setMoreOpen(true)}
                  className={cn(
                    'flex flex-col items-center justify-center min-w-[60px] py-2 transition-colors touch-target',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-5 h-5 mb-1" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            }

            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    'flex flex-col items-center justify-center min-w-[60px] py-2 transition-colors touch-target',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-5 h-5 mb-1" />
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[70vh]">
          <SheetHeader>
            <SheetTitle>More Options</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 mt-4 pb-4">
            {moreItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <Button
                  variant="outline"
                  className="w-full justify-start h-12"
                  onClick={() => setMoreOpen(false)}
                  data-testid={`more-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
