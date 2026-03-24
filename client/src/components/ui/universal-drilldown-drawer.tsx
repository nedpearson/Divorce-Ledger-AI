import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Download, Database, ChevronRight, ExternalLink } from 'lucide-react';
import { LineagePanel } from '@/components/lineage-panel';
import { DrilldownRequest, DrilldownResponse } from '@shared/schema';

interface UniversalDrilldownDrawerProps {
  stack: DrilldownRequest[];
  onPop: () => void;
  onClose: () => void;
  onPush: (req: DrilldownRequest) => void;
}

export function UniversalDrilldownDrawer({ stack, onPop, onClose, onPush }: UniversalDrilldownDrawerProps) {
  const currentRequest = stack[stack.length - 1];

  const queryString = currentRequest 
    ? `?layer=${currentRequest.layer}&sourceEntity=${currentRequest.sourceEntity}&identifier=${currentRequest.identifier}${
        currentRequest.context?.filters?.type ? `&type=${currentRequest.context.filters.type}` : ''
      }`
    : '';

  const { data, isLoading } = useQuery<DrilldownResponse>({
    queryKey: ['/api/lineage/explain' + queryString],
    enabled: !!currentRequest,
  });

  if (!currentRequest) return null;

  const handleExport = () => {
    if (!data) return;
    let content = '';
    let type = 'application/json';
    let ext = 'json';

    if (data.layer === 3 && Array.isArray(data.data.records) && data.data.records.length > 0) {
       const keys = Object.keys(data.data.records[0] || {});
       content = keys.join(',') + '\n' + data.data.records.map((r: any) => keys.map(k => `"${String(r[k] || '').replace(/"/g, '""')}"`).join(',')).join('\n');
       type = 'text/csv';
       ext = 'csv';
    } else {
       content = JSON.stringify(data, null, 2);
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drilldown-export-${data.layer}-${currentRequest.sourceEntity}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={stack.length > 0} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="right">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-2">
            {stack.length > 1 && (
              <Button variant="ghost" size="icon" onClick={onPop} className="h-8 w-8 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <SheetTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              {data ? data.title : 'Loading Investigation...'}
            </SheetTitle>
          </div>
          <div className="flex items-center justify-between mt-2">
            <SheetDescription>Tracing lineage layer {currentRequest.layer} of 8</SheetDescription>
            <div className="flex flex-wrap items-center gap-2">
              {data?.data?.detail?.fileUrl && (
                <Button variant="default" size="sm" onClick={() => window.open(data.data.detail.fileUrl, '_blank')} className="h-7 text-xs gap-1">
                  <ExternalLink className="h-3 w-3" />
                  View Document
                </Button>
              )}
              {data && (
                <Button variant="outline" size="sm" onClick={handleExport} className="h-7 text-xs gap-1">
                  <Download className="h-3 w-3" />
                  Export
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-4 overflow-x-auto pb-1">
            {stack.map((req, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
                <span className={idx === stack.length - 1 ? "font-semibold text-primary whitespace-nowrap" : "whitespace-nowrap truncate max-w-[120px]"}>
                  Layer {req.layer}: {req.sourceEntity}
                </span>
              </React.Fragment>
            ))}
          </div>
        </SheetHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <LineagePanel lineage={data.lineage} />
            
            <div className="mt-4">
              {data.data.summary && (
                <div className="bg-muted/40 p-4 rounded-xl border border-border/50 text-sm mb-6 leading-relaxed">
                  {typeof data.data.summary === 'string' 
                     ? data.data.summary 
                     : "Detailed summary data unavailable."}
                </div>
              )}
              {data.data.segments && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Segments</h4>
                  {data.data.segments.map((s, i) => (
                      <div key={i} className="border p-2 rounded text-sm bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                           onClick={() => s._nextDrilldown && onPush(s._nextDrilldown)}
                      >
                         <p className="font-medium">{s.name}</p>
                         <p className="text-muted-foreground">{s.amount}</p>
                      </div>
                  ))}
                </div>
              )}
              {data.data.records && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Contributing Records ({data.data.records.length})</h4>
                  {data.data.records.map((r, i) => (
                      <div key={i} className="border p-3 rounded-lg text-sm bg-card hover:bg-muted/50 cursor-pointer transition-all flex items-center justify-between group"
                           onClick={() => r._nextDrilldown ? onPush(r._nextDrilldown) : onPush({ layer: 4, sourceEntity: 'financial_record', identifier: r.id || 'unknown' })}
                      >
                         <div className="flex flex-col">
                           <span className="font-medium">{r.description || r.title || r.name || 'Record Entry'}</span>
                           <span className="text-xs text-muted-foreground">{r.date ? new Date(r.date).toLocaleDateString() : (r.category || r.type || 'Data Point')}</span>
                         </div>
                         <div className="flex items-center gap-3">
                           {r.amount !== undefined && <span className="font-mono text-xs font-semibold">{typeof r.amount === 'number' ? `$${Math.abs(r.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : r.amount}</span>}
                           <ChevronRight className="h-4 w-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                         </div>
                      </div>
                  ))}
                </div>
              )}
              {data.data.detail && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-sm font-semibold">Source Detail</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/40 p-4 rounded-xl border border-border/50">
                    {Object.entries(data.data.detail)
                      .filter(([k, v]) => v !== null && v !== '' && !['id', 'userId', 'documentId', 'storageFileId', 'environment', 'fileHash', '_nextDrilldown'].includes(k))
                      .map(([key, value]) => {
                        const formattedLabel = key.replace(/([A-Z])/g, ' $1').trim();
                        let formattedValue = String(value);
                        
                        if (typeof value === 'boolean') {
                          formattedValue = value ? 'Yes' : 'No';
                        } else if ((key === 'amount' || key === 'value') && typeof value === 'number') {
                          formattedValue = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
                        } else if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                          formattedValue = new Date(value).toLocaleString();
                        } else if (typeof value === 'object') {
                          formattedValue = 'Complex Data'; // Safety fallback
                        }

                        const isUrl = typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/uploads/'));

                        return (
                          <div key={key} className="flex flex-col space-y-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider capitalize">
                              {formattedLabel}
                            </span>
                            <span className="text-sm font-medium text-foreground break-words">
                              {isUrl ? (
                                <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 w-fit">
                                  View Link <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                formattedValue
                              )}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              {data.data.evidence && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-sm font-semibold text-blue-500">Cryptographically Verified Proof of Value</h4>
                  {data.data.evidence.map((e, i) => (
                      <div key={i} className="border p-4 rounded-lg text-sm bg-blue-500/10 hover:bg-blue-500/20 cursor-pointer transition-all flex items-center justify-between group"
                           onClick={() => onPush({ layer: 5, sourceEntity: 'document', identifier: e.id || e.document_id || 'unknown' })}
                      >
                         <div className="flex flex-col">
                           <span className="font-medium text-foreground">{e.title || e.fileName || 'Source Document'}</span>
                           <span className="text-xs text-muted-foreground">{e.category || e.fileType || 'Evidence Artifact'}</span>
                         </div>
                         <div className="flex items-center gap-3">
                           {e.fileSize && <span className="text-xs text-muted-foreground">{(e.fileSize / 1024 / 1024).toFixed(1)} MB</span>}
                           <ChevronRight className="h-4 w-4 text-blue-500/50 group-hover:text-blue-500 transition-colors" />
                         </div>
                      </div>
                  ))}
                </div>
              )}
              {data.data.rawMetadata && (
                <div className="space-y-2 mt-6">
                  <h4 className="text-sm font-semibold text-primary/80">Original Evidence Metadata</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-primary/5 p-4 rounded-xl border border-primary/10">
                    {Object.entries(data.data.rawMetadata)
                      .filter(([k, v]) => v !== null && v !== '' && !['id', 'userId', 'environment'].includes(k))
                      .map(([key, value]) => {
                        const formattedLabel = key.replace(/([A-Z])/g, ' $1').trim();
                        let formattedValue = String(value);
                        
                        if (typeof value === 'boolean') {
                          formattedValue = value ? 'Yes' : 'No';
                        } else if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                          formattedValue = new Date(value).toLocaleString();
                        } else if (typeof value === 'object') {
                          formattedValue = 'Nested Data Array';
                        }

                        return (
                          <div key={key} className="flex flex-col space-y-1">
                            <span className="text-xs font-semibold text-primary/60 uppercase tracking-wider capitalize">
                              {formattedLabel}
                            </span>
                            <span className="text-sm font-medium text-foreground break-words">
                              {formattedValue}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
