import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, FileText, AlertTriangle, Upload, Mic, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

interface QuickCaptureSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickCaptureSheet({ open, onOpenChange }: QuickCaptureSheetProps) {
  const [, setLocation] = useLocation();

  const handleScanDocument = () => {
    onOpenChange(false);
    setLocation('/documents?action=scan');
  };

  const handleReportViolation = () => {
    onOpenChange(false);
    setLocation('/violations?action=report');
  };

  const captureOptions = [
    {
      id: 'scan-document',
      icon: Camera,
      label: 'Scan Document',
      description: 'Take a photo of any document for AI analysis',
      gradient: 'from-blue-500 to-cyan-400',
      onClick: handleScanDocument,
    },
    {
      id: 'report-violation',
      icon: AlertTriangle,
      label: 'Report Violation',
      description: 'Quick capture with photo, voice & location',
      gradient: 'from-orange-500 to-red-400',
      onClick: handleReportViolation,
    },
    {
      id: 'upload-file',
      icon: Upload,
      label: 'Upload Files',
      description: 'Upload documents from your device',
      gradient: 'from-purple-500 to-pink-400',
      onClick: handleScanDocument,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-3xl">
        <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl">Quick Capture</SheetTitle>
          <SheetDescription>Choose how you want to add evidence to your case</SheetDescription>
        </SheetHeader>

        <div className="grid gap-3 mt-6 pb-6">
          {captureOptions.map((option) => (
            <button
              key={option.id}
              onClick={option.onClick}
              className="group w-full text-left"
              data-testid={`capture-${option.id}`}
            >
              <Card className="hover-elevate overflow-visible border-0 bg-gradient-to-r p-[1px] from-border to-border hover:from-primary/50 hover:to-primary/20 transition-all duration-300">
                <CardContent className="flex items-center gap-4 p-4 bg-card rounded-[calc(var(--radius)-1px)]">
                  <div
                    className={cn(
                      'w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-lg',
                      option.gradient
                    )}
                  >
                    <option.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-base">{option.label}</h3>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground pb-4">
          <div className="flex items-center gap-1.5">
            <Mic className="w-4 h-4" />
            <span>Voice notes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4" />
            <span>Auto-location</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            <span>AI analysis</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
