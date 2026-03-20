import { useState } from 'react';
import { Zap, AlertTriangle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from 'wouter';

interface AICreditsMeterProps {
  used: number;
  limit: number;
  resetsAt?: string;
  compact?: boolean;
}

export function AICreditsMeter({ used, limit, resetsAt, compact = false }: AICreditsMeterProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const percentage = Math.round((used / limit) * 100);
  const remaining = limit - used;

  const getColor = () => {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getProgressColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const showUpgrade = percentage >= 90;

  if (compact) {
    return (
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => setShowBreakdown(true)}>
        <Zap className={`h-4 w-4 ${getColor()}`} />
        <span className="text-sm">{remaining.toLocaleString()} credits</span>
      </Button>
    );
  }

  return (
    <>
      <Card
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setShowBreakdown(true)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className={`h-4 w-4 ${getColor()}`} />
              AI Credits
            </div>
            <Badge variant={percentage >= 80 ? 'destructive' : 'secondary'}>{percentage}%</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold">
            {remaining.toLocaleString()}{' '}
            <span className="text-sm font-normal text-muted-foreground">remaining</span>
          </div>
          <Progress value={percentage} className={getProgressColor()} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {used.toLocaleString()} / {limit.toLocaleString()} used
            </span>
            {resetsAt && <span>Resets: {new Date(resetsAt).toLocaleDateString()}</span>}
          </div>
          {showUpgrade && (
            <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-md text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-amber-800 dark:text-amber-200">Running low on credits</p>
                <Link href="/pricing">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-auto p-0 text-amber-700 dark:text-amber-300"
                  >
                    Upgrade for more
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showBreakdown} onOpenChange={setShowBreakdown}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              AI Credits Usage
            </DialogTitle>
            <DialogDescription>
              Detailed breakdown of your AI credits usage this billing period
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <div className="text-2xl font-bold">{remaining.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Credits remaining</div>
              </div>
              <Badge variant={percentage >= 80 ? 'destructive' : 'secondary'} className="text-lg">
                {percentage}%
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Used</span>
                <span className="font-medium">{used.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Limit</span>
                <span className="font-medium">{limit.toLocaleString()}</span>
              </div>
              {resetsAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Resets on</span>
                  <span className="font-medium">{new Date(resetsAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4" />
                Usage Breakdown
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>AI Pattern Detection</span>
                  <span>{Math.round(used * 0.4).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Document Analysis</span>
                  <span>{Math.round(used * 0.35).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Case Building</span>
                  <span>{Math.round(used * 0.15).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Other</span>
                  <span>{Math.round(used * 0.1).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {showUpgrade && (
              <Link href="/pricing">
                <Button className="w-full">
                  Upgrade Plan
                  <TrendingUp className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
