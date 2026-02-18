import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Sparkles, ArrowRight, Crown } from "lucide-react";
import { useSubscription, getTierBadgeColor } from "@/lib/subscription";

interface UpgradePromptProps {
  feature: string;
  reason: string;
  compact?: boolean;
}

export function UpgradePrompt({ feature, reason, compact = false }: UpgradePromptProps) {
  const { data } = useSubscription();
  const currentTier = data?.tier || "free";

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md" data-testid="upgrade-prompt-compact">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm text-amber-800 dark:text-amber-200 flex-1">{reason}</span>
        <Link href="/pricing">
          <Button size="sm" variant="outline" data-testid="button-upgrade-compact">
            Upgrade
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30" data-testid="upgrade-prompt-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-lg">Upgrade Required</CardTitle>
          </div>
          <Badge className={getTierBadgeColor(currentTier)}>
            {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} Plan
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{reason}</p>
        <div className="flex items-center gap-3">
          <Link href="/pricing">
            <Button data-testid="button-view-plans">
              <Sparkles className="h-4 w-4 mr-2" />
              View Plans
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
          <span className="text-sm text-muted-foreground">
            Starting at $12/month
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

interface UsageLimitBarProps {
  current: number;
  max: number | null;
  label: string;
  warningThreshold?: number;
}

export function UsageLimitBar({ current, max, label, warningThreshold = 0.8 }: UsageLimitBarProps) {
  if (max === null || max === -1) {
    return (
      <div className="space-y-1" data-testid="usage-limit-unlimited">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{current} / Unlimited</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-green-500 w-1/4 rounded-full" />
        </div>
      </div>
    );
  }

  const percentage = Math.min((current / max) * 100, 100);
  const isWarning = percentage >= warningThreshold * 100;
  const isAtLimit = percentage >= 100;

  return (
    <div className="space-y-1" data-testid="usage-limit-bar">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${isAtLimit ? "text-red-600 dark:text-red-400" : isWarning ? "text-amber-600 dark:text-amber-400" : ""}`}>
          {current} / {max}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${
            isAtLimit ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isAtLimit && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Limit reached. <Link href="/pricing" className="underline">Upgrade to continue</Link>
        </p>
      )}
    </div>
  );
}

export function SubscriptionBadge() {
  const { data } = useSubscription();
  const tier = data?.tier || "free";
  
  return (
    <Link href="/pricing">
      <Badge 
        className={`cursor-pointer ${getTierBadgeColor(tier)}`}
        data-testid="badge-subscription-tier"
      >
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </Badge>
    </Link>
  );
}
