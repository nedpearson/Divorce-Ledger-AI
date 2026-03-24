import * as React from 'react';
import { cn } from '@/lib/utils';
import { FileText, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionProps?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon: Icon = FileText,
  title,
  description,
  actionProps,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-xl bg-muted/30 animate-in fade-in-50 duration-500',
        className
      )}
      {...props}
    >
      <div className="bg-muted p-4 rounded-full mb-4 shadow-sm border border-border/50">
        <Icon className="h-6 w-6 text-muted-foreground opacity-75" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">{description}</p>
      {actionProps && (
        <Button onClick={actionProps.onClick} variant="default" className="mt-6 text-sm">
          {actionProps.label}
        </Button>
      )}
    </div>
  );
}
