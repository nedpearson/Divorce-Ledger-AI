import {
  FileText,
  AlertTriangle,
  MessageSquare,
  Calendar,
  Scale,
  Users,
  Home,
  BarChart3,
  Bot,
  Settings,
  Construction,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

const pageConfigs: Record<string, { title: string; description: string; icon: React.ElementType }> =
  {
    documents: {
      title: 'Documents',
      description: 'Upload, organize, and manage all your legal and financial documents.',
      icon: FileText,
    },
    violations: {
      title: 'Violations',
      description: 'Document and track violations against court orders and agreements.',
      icon: AlertTriangle,
    },
    communication: {
      title: 'Communication',
      description: 'Secure messaging with your attorney and case-related parties.',
      icon: MessageSquare,
    },
    calendar: {
      title: 'Calendar',
      description: 'Track court dates, custody schedules, and important deadlines.',
      icon: Calendar,
    },
    legal: {
      title: 'Legal',
      description: 'View agreements, court filings, and settlement documents.',
      icon: Scale,
    },
    'child-support': {
      title: 'Child Support',
      description: 'Track child support payments, modifications, and custody arrangements.',
      icon: Users,
    },
    property: {
      title: 'Property Settlement',
      description: 'Manage asset division and equitable distribution tracking.',
      icon: Home,
    },
    analytics: {
      title: 'Analytics & Reports',
      description: 'Forensic insights, financial analysis, and detailed reporting.',
      icon: BarChart3,
    },
    'ai-coach': {
      title: 'AI Coach',
      description: 'Get AI-powered strategy suggestions and case analysis.',
      icon: Bot,
    },
    settings: {
      title: 'Settings',
      description: 'Manage your profile, subscription, and integrations.',
      icon: Settings,
    },
  };

export default function PlaceholderPage({ page }: { page: string }) {
  const { environment } = useAuth();
  const config = pageConfigs[page] || {
    title: 'Coming Soon',
    description: 'This feature is under development.',
    icon: Construction,
  };
  const Icon = config.icon;

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1" data-testid="text-page-title">
          {config.title}
        </h1>
        <p className="text-sm text-muted-foreground">{config.description}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="p-4 bg-primary/10 rounded-full mb-4">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-medium mb-2">Coming Soon</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            This module is currently under development. Check back soon for full functionality.
          </p>
          <Button variant="outline" data-testid="button-notify-me">
            Notify me when ready
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
