import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export function GlobalBackButton() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const handleBack = () => {
    // If there is browser history, use it so back works across sites
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    // Fallback: send authed users to home, others to landing
    if (isAuthenticated) {
      if (location !== '/home') setLocation('/home');
    } else {
      if (location !== '/') setLocation('/');
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleBack}
      aria-label="Go back"
      className="fixed left-3 top-3 z-40 h-8 w-8 rounded-full border bg-background/90 shadow-sm backdrop-blur-sm hover:bg-background"
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}
