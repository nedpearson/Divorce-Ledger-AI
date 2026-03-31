import { useState, useEffect } from 'react';
import { Bell, FileText, AlertTriangle, CheckCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow, format } from 'date-fns';
import type { Document, Violation, CalendarEvent } from '@shared/schema';

export function NotificationsBell({ isMobile = false }: { isMobile?: boolean }) {
  const [lastRead, setLastRead] = useState<number>(() => {
    const stored = localStorage.getItem('notifications_last_read');
    return stored ? parseInt(stored) : Date.now() - 86400000; // default 1 day ago
  });

  const { data: documents = [] } = useQuery<Document[]>({ queryKey: ['/api/documents'] });
  const { data: violations = [] } = useQuery<Violation[]>({ queryKey: ['/api/violations'] });
  const { data: events = [] } = useQuery<CalendarEvent[]>({ queryKey: ['/api/calendar-events'] });

  const notifications = [
    ...documents.map(d => ({
      id: `doc-${d.id}`,
      type: 'document',
      title: 'Document Uploaded',
      description: d.title || 'New document processed',
      date: new Date(d.createdAt),
      icon: FileText,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    })),
    ...violations.map(v => ({
      id: `viol-${v.id}`,
      type: 'violation',
      title: 'Violation Recorded',
      description: v.description || v.type,
      date: new Date(v.timestamp),
      icon: AlertTriangle,
      color: 'text-red-500',
      bgColor: 'bg-red-100 dark:bg-red-900/30'
    })),
    ...events.map(e => ({
      id: `event-${e.id}`,
      type: 'event',
      title: 'Event Scheduled',
      description: `${e.title} on ${format(new Date(e.startDate), 'MMM d, yyyy')}`,
      date: new Date(e.createdAt),
      icon: Calendar,
      color: 'text-purple-500',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30'
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);

  const unreadCount = notifications.filter(n => n.date.getTime() > lastRead).length;

  const handleOpenChange = (open: boolean) => {
    if (open) {
      const now = Date.now();
      setLastRead(now);
      localStorage.setItem('notifications_last_read', now.toString());
    }
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex justify-between items-center">
          <span>Notifications</span>
          {unreadCount > 0 && <Badge variant="secondary" className="text-xs">{unreadCount} New</Badge>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-80">
          <DropdownMenuGroup>
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground flex flex-col items-center">
                <CheckCircle className="h-8 w-8 text-green-500 mb-2 opacity-50" />
                <p>You're all caught up!</p>
              </div>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem key={n.id} className="flex gap-3 items-start p-3 cursor-pointer">
                  <div className={`p-2 rounded-full ${n.bgColor}`}>
                    <n.icon className={`h-4 w-4 ${n.color}`} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(n.date, { addSuffix: true })}
                    </p>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
