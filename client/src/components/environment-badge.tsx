import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Globe, TestTube2 } from 'lucide-react';

export function EnvironmentBadge({ className = '' }: { className?: string }) {
  const { environment } = useAuth();

  if (!environment) return null;

  const isLive = environment.startsWith('live');
  const isDemo = environment === 'demo';
  const isTest = environment.startsWith('demo-test');

  if (isLive) {
    return (
      <Badge
        variant="default"
        className={`bg-green-600 hover:bg-green-600 text-white text-xs gap-1 ${className}`}
        data-testid="badge-live-view"
      >
        <Globe className="h-3 w-3" />
        Live View
      </Badge>
    );
  }

  if (isTest) {
    return (
      <Badge
        variant="secondary"
        className={`bg-yellow-600/20 text-yellow-600 border-yellow-600/30 hover:bg-yellow-600/30 text-xs gap-1 ${className}`}
        data-testid="badge-test-mode"
      >
        <TestTube2 className="h-3 w-3" />
        Test Mode
      </Badge>
    );
  }

  return null;
}
