import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sparkles, Check, Calendar, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface ChangelogEntry {
  id: string;
  title: string;
  description: string;
  implementedAt: string;
  translations?: Record<string, string>;
}

export default function ChangelogPage() {
  const { data: changelog = [], isLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ['/api/changelog'],
  });

  const groupedByMonth = changelog.reduce(
    (acc, entry) => {
      const date = new Date(entry.implementedAt);
      const monthKey = format(date, 'MMMM yyyy');
      if (!acc[monthKey]) acc[monthKey] = [];
      acc[monthKey].push(entry);
      return acc;
    },
    {} as Record<string, ChangelogEntry[]>
  );

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">What's New</h1>
          <p className="text-muted-foreground">Recent improvements and updates to Divorce Ledger</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : changelog.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Updates Yet</h3>
            <p className="text-muted-foreground">
              Check back soon for new features and improvements!
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-8">
            {Object.entries(groupedByMonth).map(([month, entries], monthIndex) => (
              <div key={month}>
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{month}</h2>
                  <Badge variant="outline" className="ml-auto">
                    {entries.length} updates
                  </Badge>
                </div>

                <div className="space-y-4">
                  {entries.map((entry) => (
                    <Card key={entry.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start gap-3">
                          <div className="p-1.5 bg-green-100 dark:bg-green-900 rounded-full mt-0.5">
                            <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-base">{entry.title}</CardTitle>
                            <CardDescription className="text-xs">
                              {format(new Date(entry.implementedAt), 'MMMM d, yyyy')}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground pl-9">{entry.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {monthIndex < Object.keys(groupedByMonth).length - 1 && (
                  <Separator className="mt-6" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
