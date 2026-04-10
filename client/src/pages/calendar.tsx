import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  MapPin,
  Bell,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit,
  Loader2,
  Download,
  RefreshCw,
  Unplug,
  ExternalLink,
  Chrome,
} from 'lucide-react';
import type { CalendarEvent } from '@shared/schema';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';

const eventTypes = [
  { value: 'court_hearing', label: 'Court Hearing', color: 'bg-red-500' },
  { value: 'mediation', label: 'Mediation', color: 'bg-orange-500' },
  { value: 'custody_exchange', label: 'Custody Exchange', color: 'bg-blue-500' },
  { value: 'attorney_meeting', label: 'Attorney Meeting', color: 'bg-purple-500' },
  { value: 'deadline', label: 'Deadline', color: 'bg-yellow-500' },
  { value: 'deposition', label: 'Deposition', color: 'bg-pink-500' },
  { value: 'google_calendar', label: 'Google Calendar', color: 'bg-emerald-500' },
  { value: 'other', label: 'Other', color: 'bg-gray-500' },
];

function getEventTypeInfo(type: string) {
  return eventTypes.find((t) => t.value === type) || eventTypes[eventTypes.length - 1];
}

// ─── Google Calendar Sync Banner ──────────────────────────────────────

interface GoogleCalendarStatus {
  isConnected: boolean;
  externalAccountId?: string;
  displayName?: string;
}

function GoogleCalendarBanner() {
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<GoogleCalendarStatus>({
    queryKey: ['/api/integrations/google-calendar/status'],
    retry: false,
    staleTime: 60_000,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/integrations/google-calendar/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-calendar/events'] });
      toast({ title: 'Google Calendar disconnected' });
    },
  });

  if (isLoading) return null;

  if (status?.isConnected) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex items-center justify-between py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CalendarIcon className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Google Calendar Synced</p>
              <p className="text-xs text-muted-foreground">{status.externalAccountId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-calendar/events'] })}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              <Unplug className="h-3.5 w-3.5 mr-1" />
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed border-muted-foreground/30">
      <CardContent className="flex items-center justify-between py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Chrome className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Connect Google Calendar</p>
            <p className="text-xs text-muted-foreground">Sign in with Google to sync your calendar events</p>
          </div>
        </div>
        <Button size="sm" variant="outline" asChild>
          <a href="/api/auth/google">
            <Chrome className="h-3.5 w-3.5 mr-1.5" />
            Connect
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Add Event Dialog ─────────────────────────────────────────────────

function AddEventDialog({
  onSuccess,
  selectedDate,
}: {
  onSuccess: () => void;
  selectedDate?: Date;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(
    selectedDate ? format(selectedDate, "yyyy-MM-dd'T'HH:mm") : ''
  );
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/calendar-events', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Event Created', description: 'Your event has been added to the calendar.' });
      setOpen(false);
      setTitle('');
      setEventType('');
      setDescription('');
      setStartDate('');
      setLocation('');
      setAllDay(false);
      onSuccess();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create event.', variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-event">
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Calendar Event</DialogTitle>
          <DialogDescription>Schedule a new event or deadline.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Event Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Court Hearing"
              data-testid="input-event-title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eventType">Event Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger data-testid="select-event-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.filter(t => t.value !== 'google_calendar').map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${type.color}`} />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">Date & Time</Label>
            <Input
              id="startDate"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="input-event-date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., County Courthouse Room 302"
              data-testid="input-event-location"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Notes</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details..."
              className="resize-none"
              data-testid="input-event-notes"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4"
              data-testid="checkbox-all-day"
            />
            <Label htmlFor="allDay">All-day event</Label>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              createMutation.mutate({ title, eventType, description, startDate, location, allDay })
            }
            disabled={!title || !eventType || !startDate || createMutation.isPending}
            data-testid="button-save-event"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Event
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────

interface UnifiedEvent {
  id: string;
  title: string;
  description?: string | null;
  eventType: string;
  startDate: string;
  endDate?: string | null;
  allDay?: boolean;
  location?: string | null;
  source?: 'local' | 'google';
  htmlLink?: string;
}

function EventCard({ event, onDelete }: { event: UnifiedEvent; onDelete?: () => void }) {
  const { toast } = useToast();
  const typeInfo = getEventTypeInfo(event.eventType);
  const isGoogle = event.source === 'google';

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/calendar-events/${event.id}`);
    },
    onSuccess: () => {
      toast({ title: 'Deleted', description: 'Event has been removed.' });
      onDelete?.();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete event.', variant: 'destructive' });
    },
  });

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 group"
      data-testid={`event-${event.id}`}
    >
      <div className={`w-1 h-full min-h-[40px] rounded-full ${typeInfo.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-medium">{event.title}</h4>
          <Badge variant="outline" className="text-xs">
            {typeInfo.label}
          </Badge>
          {isGoogle && (
            <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              Google
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(event.startDate), event.allDay ? 'MMM d, yyyy' : 'MMM d, yyyy h:mm a')}
          </span>
          {event.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {event.location}
            </span>
          )}
        </div>
        {event.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isGoogle && event.htmlLink ? (
          <Button variant="ghost" size="icon" asChild>
            <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="icon" data-testid={`button-edit-event-${event.id}`}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-event-${event.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Calendar Grid ────────────────────────────────────────────────────

function CalendarGrid({
  events,
  selectedDate,
  onSelectDate,
}: {
  events: UnifiedEvent[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startPadding = monthStart.getDay();
  const paddingDays = Array(startPadding).fill(null);

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(new Date(event.startDate), day));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{format(currentMonth, 'MMMM yyyy')}</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {paddingDays.map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square p-1" />
          ))}
          {days.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);

            return (
              <button
                key={day.toISOString()}
                onClick={() => onSelectDate(day)}
                className={`aspect-square p-1 rounded-md text-sm transition-colors relative
                  ${isSelected ? 'bg-primary text-primary-foreground' : 'hover-elevate'}
                  ${isTodayDate && !isSelected ? 'ring-1 ring-primary' : ''}
                  ${!isSameMonth(day, currentMonth) ? 'text-muted-foreground/50' : ''}
                `}
                data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
              >
                <span className="block">{format(day, 'd')}</span>
                {dayEvents.length > 0 && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {dayEvents.slice(0, 3).map((event, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full ${getEventTypeInfo(event.eventType).color}`}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Calendar Page ───────────────────────────────────────────────

export default function CalendarPage() {
  const { environment } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Local events from the app database
  const {
    data: localEvents,
    isLoading: loadingLocal,
    refetch: refetchLocal,
  } = useQuery<CalendarEvent[]>({
    queryKey: ['/api/calendar-events'],
  });

  // Google Calendar events
  const {
    data: googleData,
    isLoading: loadingGoogle,
  } = useQuery<{ events: UnifiedEvent[]; synced: boolean }>({
    queryKey: ['/api/integrations/google-calendar/events'],
    retry: false,
    staleTime: 60_000,
  });

  // Merge local + Google events into unified list
  const allEvents: UnifiedEvent[] = useMemo(() => {
    const local: UnifiedEvent[] = (localEvents || []).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      eventType: e.eventType,
      startDate: typeof e.startDate === 'string' ? e.startDate : new Date(e.startDate).toISOString(),
      endDate: e.endDate ? (typeof e.endDate === 'string' ? e.endDate : new Date(e.endDate).toISOString()) : null,
      allDay: e.allDay ?? false,
      location: e.location,
      source: 'local' as const,
    }));

    const google: UnifiedEvent[] = googleData?.events || [];

    return [...local, ...google].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }, [localEvents, googleData]);

  const isLoading = loadingLocal || loadingGoogle;

  const upcomingEvents = allEvents
    .filter((event) => new Date(event.startDate) >= new Date())
    .slice(0, 5);

  const selectedDayEvents = allEvents.filter((event) =>
    isSameDay(new Date(event.startDate), selectedDate)
  );

  const exportData = () => {
    if (allEvents.length === 0) return;
    const headers = ['Title', 'Type', 'Start Date', 'Location', 'Notes', 'All Day', 'Source'];
    const csvContent = [
      headers.join(','),
      ...allEvents.map((e) =>
        [
          `"${e.title.replace(/"/g, '""')}"`,
          getEventTypeInfo(e.eventType).label,
          format(new Date(e.startDate), 'yyyy-MM-dd HH:mm'),
          `"${(e.location || '').replace(/"/g, '""')}"`,
          `"${(e.description || '').replace(/"/g, '""')}"`,
          e.allDay ? 'Yes' : 'No',
          e.source || 'local',
        ].join(',')
      ),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendar_events_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const googleEventCount = googleData?.events?.length || 0;

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6" data-testid="page-calendar">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            Track court dates, custody schedules, and important deadlines.
            {googleEventCount > 0 && (
              <span className="text-emerald-400 ml-1">
                · {googleEventCount} Google event{googleEventCount !== 1 ? 's' : ''} synced
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportData} disabled={allEvents.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <AddEventDialog 
            onSuccess={() => queryClient.invalidateQueries({ queryKey: ['/api/calendar-events'] })} 
            selectedDate={selectedDate} 
          />
        </div>
      </div>

      {/* Google Calendar Integration Banner */}
      <GoogleCalendarBanner />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CalendarGrid
              events={allEvents}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  {format(selectedDate, 'MMMM d, yyyy')}
                </CardTitle>
                <CardDescription>
                  {selectedDayEvents.length === 0
                    ? 'No events scheduled'
                    : `${selectedDayEvents.length} event${selectedDayEvents.length > 1 ? 's' : ''}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No events on this day.
                  </p>
                ) : (
                  selectedDayEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onDelete={event.source === 'local' ? () => refetchLocal() : undefined}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Upcoming Events
                </CardTitle>
                <CardDescription>Next 5 scheduled events</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No upcoming events.
                  </p>
                ) : (
                  upcomingEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onDelete={event.source === 'local' ? () => refetchLocal() : undefined}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
