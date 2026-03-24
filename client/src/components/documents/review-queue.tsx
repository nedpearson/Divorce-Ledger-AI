import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, Clock, Edit2, AlertTriangle, FileText, ArrowRight, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDrilldown } from '@/lib/drilldown-context';

interface DataSyncProposal {
  id: string;
  documentId: string;
  targetTable: string;
  proposedData: Record<string, any>;
  confidenceScore: number;
  rationale: string;
  sourceLineage: any;
  downstreamEffects: string;
  status: string;
  createdAt: string;
  document: {
    fileName: string;
    fileUrl: string;
    mimeType: string;
  };
}

export function ReviewQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { openDrilldown } = useDrilldown();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPayload, setEditPayload] = useState<string>('');

  const { data: proposals, isLoading } = useQuery<DataSyncProposal[]>({
    queryKey: ['/api/lineage/proposals'],
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action, editedData }: { id: string, action: string, editedData?: any }) => {
      const res = await fetch(`/api/lineage/proposals/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, editedData })
      });
      if (!res.ok) throw new Error('Failed to resolve proposal');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lineage/proposals'] });
      setEditingId(null);
      toast({ title: "Queue updated", description: "The proposal has been processed." });
    }
  });

  if (isLoading) return <div className="text-sm text-muted-foreground animate-pulse p-4">Loading verification queue...</div>;
  if (!proposals || proposals.length === 0) return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-950 border border-white/5 rounded-xl border-dashed">
      <Check className="h-8 w-8 text-emerald-500 mb-3" />
      <h3 className="font-medium text-white">Review Queue Empty</h3>
      <p className="text-sm text-zinc-400 mt-1">All AI document extractions have been structurally verified.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Human Verification Required
          </h2>
          <p className="text-sm text-zinc-400">Review uncertain data allocations before they are committed natively to the legal ledgers.</p>
        </div>
        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-3 py-1">
          {proposals.length} Pending Rules
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {proposals.map(proposal => {
          const isEditing = editingId === proposal.id;
          const isHighConfidence = proposal.confidenceScore >= 0.8;
          const isLowConfidence = proposal.confidenceScore < 0.5;

          return (
            <Card key={proposal.id} className="border border-white/10 bg-zinc-950/50 backdrop-blur overflow-hidden">
              <div className="flex flex-col md:flex-row">
                
                {/* Left: Artifact Visual Lineage */}
                <div className="w-full md:w-1/3 bg-zinc-900/50 p-4 border-b md:border-b-0 md:border-r border-white/10 flex flex-col">
                  <div className="flex items-center gap-2 mb-3 text-sm font-medium text-zinc-300">
                    <FileText className="h-4 w-4 text-blue-400" />
                    Source Evidence Artifact
                  </div>
                  <div className="text-xs text-zinc-500 mb-4 truncate" title={proposal.document.fileName}>
                    {proposal.document.fileName}
                  </div>
                  <div className="flex-1 bg-zinc-950 rounded-lg border border-white/5 flex items-center justify-center p-2 min-h-[160px] relative overflow-hidden group">
                    {proposal.document.mimeType?.includes('image') ? (
                      <img src={proposal.document.fileUrl} alt="Document Extract" className="max-h-full max-w-full object-contain opacity-80 group-hover:opacity-100 transition-opacity cursor-pointer z-10" onClick={() => openDrilldown({ layer: 5, sourceEntity: 'document', identifier: proposal.documentId })} />
                    ) : (
                      <div className="text-center p-4 cursor-pointer hover:bg-zinc-800/50 rounded-lg transition-colors z-10" onClick={() => openDrilldown({ layer: 5, sourceEntity: 'document', identifier: proposal.documentId })}>
                        <FileText className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                        <span className="text-xs text-zinc-500 block">PDF Layout Preview</span>
                        <div className="text-xs text-blue-400 hover:underline mt-2 inline-flex items-center gap-1">
                           <Search className="h-3 w-3" /> Inspect Source Native
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Structural Mapping Proposition */}
                <div className="flex-1 p-5 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="cursor-pointer group" onClick={() => openDrilldown({ layer: 1, sourceEntity: 'data_sync_proposal', identifier: proposal.id })}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="border-blue-500/30 text-blue-400 font-mono text-xs bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
                          {proposal.targetTable.toUpperCase()}
                        </Badge>
                        <ArrowRight className="h-3 w-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                        <span className="text-xs font-semibold text-zinc-300 group-hover:text-blue-300 transition-colors flex items-center gap-1">
                           <Search className="h-3 w-3" /> Structural Drilldown Tracking
                        </span>
                      </div>
                      <CardTitle className="text-base font-medium text-white group-hover:text-zinc-200 transition-colors mt-2">{proposal.rationale}</CardTitle>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-mono font-medium px-2 py-1 rounded-md mb-1 inline-block ${
                        isHighConfidence ? 'bg-emerald-500/10 text-emerald-400' :
                        isLowConfidence ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {Math.round(proposal.confidenceScore * 100)}% Match
                      </div>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="flex-1 mb-4 space-y-2">
                      <Label className="text-xs text-zinc-400">Override JSON Payload Natively</Label>
                      <Textarea 
                        className="font-mono text-xs min-h-[120px] bg-zinc-950 border-zinc-800"
                        value={editPayload}
                        onChange={(e) => setEditPayload(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div 
                      className="flex-1 mb-4 bg-zinc-900/50 rounded-lg p-3 border border-white/5 font-mono text-xs overflow-auto max-h-[150px] cursor-pointer hover:border-blue-500/30 transition-all hover:bg-zinc-900/80"
                      onClick={() => openDrilldown({ layer: 1, sourceEntity: 'data_sync_proposal', identifier: proposal.id })}
                    >
                      {Object.entries(proposal.proposedData).map(([key, val]) => (
                        <div key={key} className="flex flex-col sm:flex-row mb-2 border-b border-white/5 pb-2 last:border-0 last:pb-0 group">
                          <span className="text-zinc-500 w-1/3 truncate group-hover:text-blue-400 transition-colors">{key}:</span>
                          <span className="text-zinc-200 w-2/3 truncate group-hover:text-white transition-colors" title={String(val)}>{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-zinc-500 mb-4 flex items-center gap-1">
                    <span className="font-semibold text-zinc-400">Rule:</span> {proposal.downstreamEffects}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2 pt-4 border-t border-white/10">
                    {isEditing ? (
                      <>
                        <Button 
                          size="sm" 
                          variant="secondary" 
                          onClick={() => setEditingId(null)}
                          className="bg-zinc-800 text-white hover:bg-zinc-700"
                        >
                          Cancel
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => {
                            try {
                              const parsed = JSON.parse(editPayload);
                              resolveMutation.mutate({ id: proposal.id, action: 'edit_and_approve', editedData: parsed });
                            } catch (e) {
                              toast({ variant: 'destructive', title: 'Invalid JSON format' });
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <Check className="h-4 w-4 mr-1" /> Commit Override
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button 
                          size="sm" 
                          onClick={() => resolveMutation.mutate({ id: proposal.id, action: 'approve' })}
                          className="bg-emerald-600/20 text-emerald-500 hover:bg-emerald-600 hover:text-white border border-emerald-500/30"
                        >
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setEditPayload(JSON.stringify(proposal.proposedData, null, 2));
                            setEditingId(proposal.id);
                          }}
                          className="bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                        >
                          <Edit2 className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => resolveMutation.mutate({ id: proposal.id, action: 'defer' })}
                          className="bg-zinc-900 text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          <Clock className="h-4 w-4 mr-1" /> Defer
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => resolveMutation.mutate({ id: proposal.id, action: 'reject' })}
                          className="bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500 hover:text-white ml-auto"
                        >
                          <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
