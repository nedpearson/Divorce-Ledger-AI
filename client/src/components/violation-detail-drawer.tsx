import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Clock,
  MapPin,
  Image as ImageIcon,
  Video,
  Users,
  FileText,
  Download,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Violation } from '@shared/schema';

interface ViolationDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  violation: Violation | null;
}

export function ViolationDetailDrawer({
  open,
  onOpenChange,
  violation,
}: ViolationDetailDrawerProps) {
  if (!violation) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg" data-testid="violation-detail-sheet">
        <SheetHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="uppercase text-xs tracking-wider">
              {violation.type.replace('_', ' ')}
            </Badge>
            <Badge
              variant={
                violation.status === 'approved'
                  ? 'default'
                  : violation.status === 'reviewed'
                  ? 'secondary'
                  : 'outline'
              }
              className={violation.status === 'approved' ? 'bg-green-600 text-white' : ''}
            >
              {violation.status}
            </Badge>
          </div>
          <SheetTitle className="flex items-center gap-2" data-testid="violation-detail-title">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Violation Report
          </SheetTitle>
          <SheetDescription>
            Documented on {format(new Date(violation.timestamp), 'MMMM d, yyyy h:mm a')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Incident Details</TabsTrigger>
              <TabsTrigger value="evidence">
                Evidence
                {((violation.photoCount || 0) > 0 || (violation.videoDuration || 0) > 0) && (
                  <Badge variant="secondary" className="ml-2">
                    {(violation.photoCount || 0) + (violation.videoDuration ? 1 : 0)}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-6 pr-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Description text
                    </h4>
                    <p className="text-sm bg-muted/50 p-4 rounded-lg leading-relaxed border">
                      {violation.description}
                    </p>
                  </div>

                  {violation.audioTranscript && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                        Voice Transcript
                      </h4>
                      <p className="text-sm bg-primary/5 p-4 rounded-lg italic border border-primary/20">
                        "{violation.audioTranscript}"
                      </p>
                    </div>
                  )}

                  <Separator />

                  <div className="grid gap-4">
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Context
                    </h4>

                    {violation.location && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Mapped Location</p>
                          <p className="text-sm text-muted-foreground">{violation.location}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Recorded Time</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(violation.timestamp), 'MMM d, yyyy - h:mm a')}
                        </p>
                      </div>
                    </div>

                    {violation.witnesses && violation.witnesses.length > 0 && (
                      <div className="flex items-start gap-3">
                        <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Witnesses Present</p>
                          <ul className="text-sm text-muted-foreground list-disc list-inside mt-1">
                            {violation.witnesses.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="evidence" className="mt-4">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-4 pr-4">
                  {(violation.photoCount || 0) > 0 || (violation.videoDuration || 0) > 0 || (violation.mediaUrls && violation.mediaUrls.length > 0) ? (
                    <div className="space-y-3">
                      {violation.mediaUrls?.map((url, i) => (
                        <div key={i} className="rounded-lg border p-4 space-y-4 bg-muted/30">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-primary/10 p-3">
                              {url.includes('.mp4') || url.includes('.mov') ? (
                                <Video className="h-6 w-6 text-primary" />
                              ) : (
                                <ImageIcon className="h-6 w-6 text-primary" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                Evidence_File_{i+1}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Secure Cloud Storage
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="w-full">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View Media
                            </Button>
                            <Button size="sm" className="w-full">
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(!violation.mediaUrls || violation.mediaUrls.length === 0) && (
                         <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                           Media paths are encrypted or unavailable in this environment.
                         </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium mb-1">No Evidence Attached</p>
                      <p className="text-sm text-muted-foreground">
                        This violation was recorded purely via text or voice.
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
