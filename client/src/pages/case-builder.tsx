import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  FileText,
  Camera,
  Users,
  Clock,
  AlertTriangle,
  TrendingUp,
  Scale,
  Download,
  Copy,
  CheckCircle,
  MapPin,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Violation } from '@shared/schema';

interface PatternAnalysis {
  type: string;
  displayType: string;
  occurrences: number;
  avgDelay?: string;
  locations?: string[];
  severity: string;
  courtRecommendation: string;
}

interface CaseSummary {
  title: string;
  allegation: string;
  incidents: Array<{
    date: string;
    type: string;
    description: string;
    location?: string;
    witnesses?: string[];
    photoCount: number;
  }>;
  patterns: PatternAnalysis[];
  impact: string;
  reliefSought: string;
}

const VIOLATION_DEFINITIONS: Record<string, string> = {
  late_pickup:
    "Failure to return children at the court-ordered exchange time, causing disruption to the custodial parent's schedule and the children's routine.",
  late_dropoff:
    'Failure to deliver children at the agreed upon time, violating the custody exchange schedule.',
  missed_visitation:
    'Complete failure to exercise scheduled parenting time without prior notice or arrangement.',
  denied_visitation:
    'Unlawful prevention of the non-custodial parent from exercising their court-ordered parenting time.',
  communication_violation:
    "Failure to maintain required communication regarding children's welfare as specified in the custody order.",
  schedule_change:
    'Unilateral modification of the custody schedule without proper notice or agreement.',
  relocation_violation:
    'Moving or attempting to move children outside the agreed geographic area without court approval.',
  unspecified: 'Violation of custody terms as documented in the attached evidence.',
};

export default function CaseBuilder() {
  const { environment } = useAuth();
  const { toast } = useToast();
  const [narrative, setNarrative] = useState('');
  const [generatedFiling, setGeneratedFiling] = useState<string | null>(null);

  const { data: violations = [], isLoading: violationsLoading } = useQuery<Violation[]>({
    queryKey: ['/api/violations', environment],
    queryFn: async () => {
      const res = await fetch(`/api/violations?environment=${environment}`);
      if (!res.ok) throw new Error('Failed to load violations');
      return res.json();
    },
  });

  const { data: patterns = [] } = useQuery<PatternAnalysis[]>({
    queryKey: ['/api/patterns', environment],
    queryFn: async () => {
      const res = await fetch(`/api/patterns?environment=${environment}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const documentedViolations = violations.filter((v) => !v.isDraft);

  const generateCaseSummary = (): CaseSummary | null => {
    if (documentedViolations.length === 0) return null;

    const typeGroups: Record<string, Violation[]> = {};
    for (const v of documentedViolations) {
      const vType = v.type || 'unspecified';
      if (!typeGroups[vType]) typeGroups[vType] = [];
      typeGroups[vType].push(v);
    }

    const sortedTypes = Object.entries(typeGroups).sort((a, b) => b[1].length - a[1].length);
    if (sortedTypes.length === 0) return null;

    const primaryType = sortedTypes[0];
    const typeName = (primaryType[0] || 'violation')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const incidents = documentedViolations
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
      .map((v) => ({
        date: new Date(v.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        type: (v.type || 'unspecified').replace(/_/g, ' '),
        description: v.description || 'No description provided',
        location: v.location || undefined,
        witnesses: v.witnesses || undefined,
        photoCount: v.photoCount || 0,
      }));

    return {
      title: `Violation of Court Order: ${typeName}`,
      allegation: `Respondent has repeatedly violated the court-ordered custody agreement through ${documentedViolations.length} documented ${typeName.toLowerCase()} incidents, constituting material breach of custody terms.`,
      incidents,
      patterns: Array.isArray(patterns) ? patterns.filter((p) => p.occurrences >= 2) : [],
      impact:
        'Children have been negatively affected by repeated violations, causing emotional distress and disruption to established routines. Documentation shows a consistent pattern of non-compliance.',
      reliefSought:
        "Modification of custody arrangement and enforcement of existing court order to ensure compliance and protect the children's well-being.",
    };
  };

  const caseSummary = generateCaseSummary();

  const generateCourtFiling = () => {
    if (!narrative.trim()) {
      toast({ title: 'Please describe what happened', variant: 'destructive' });
      return;
    }

    const typeGroups: Record<string, Violation[]> = {};
    for (const v of documentedViolations) {
      const vType = v.type || 'unspecified';
      if (!typeGroups[vType]) typeGroups[vType] = [];
      typeGroups[vType].push(v);
    }

    const totalEvidence = documentedViolations.reduce((sum, v) => sum + (v.photoCount || 0), 0);
    const allLocations = Array.from(
      new Set(documentedViolations.filter((v) => v.location).map((v) => v.location))
    );
    const dateRange =
      documentedViolations.length > 0
        ? {
            earliest: new Date(
              Math.min(...documentedViolations.map((v) => new Date(v.timestamp).getTime()))
            ),
            latest: new Date(
              Math.max(...documentedViolations.map((v) => new Date(v.timestamp).getTime()))
            ),
          }
        : null;

    const violationTypes = Object.keys(typeGroups);
    const definitions = violationTypes
      .map(
        (type) =>
          `${type.replace(/_/g, ' ').toUpperCase()}: ${VIOLATION_DEFINITIONS[type] || VIOLATION_DEFINITIONS.unspecified}`
      )
      .join('\n\n');

    const safePatterns = Array.isArray(patterns) ? patterns : [];
    const patternSummary =
      safePatterns.length > 0
        ? safePatterns
            .map(
              (p) =>
                `- ${p.displayType}: ${p.occurrences} occurrences (${p.severity} severity)${p.avgDelay ? `, avg delay: ${p.avgDelay}` : ''}`
            )
            .join('\n')
        : 'No recurring patterns detected at this time.';

    const impactStatement = safePatterns.some(
      (p) => p.severity === 'critical' || p.severity === 'high'
    )
      ? "The documented violations have caused significant emotional distress and disruption to the children's well-being and established routines. The pattern of non-compliance demonstrates a willful disregard for court orders."
      : "The documented violations have caused disruption to the children's routines and the custodial parent's schedule. Continued non-compliance may escalate if not addressed.";

    const filing = `
═══════════════════════════════════════════════════════════════════════════════
                          COURT FILING DOCUMENT
                    Motion for Enforcement of Custody Order
═══════════════════════════════════════════════════════════════════════════════

CASE INFORMATION
────────────────────────────────────────────────────────────────────────────────
Filing Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
Environment: ${environment.toUpperCase()}
Document Type: Motion for Contempt / Enforcement

═══════════════════════════════════════════════════════════════════════════════
                           STATEMENT OF FACTS
═══════════════════════════════════════════════════════════════════════════════

WHAT HAPPENED:
${narrative}

═══════════════════════════════════════════════════════════════════════════════
                         AUTO-POPULATED DATA
═══════════════════════════════════════════════════════════════════════════════

DATES & TIMELINE
────────────────────────────────────────────────────────────────────────────────
${dateRange ? `Incident Period: ${dateRange.earliest.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} to ${dateRange.latest.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'No documented incidents'}
Total Documented Incidents: ${documentedViolations.length}

Incident Details:
${documentedViolations
  .slice(0, 10)
  .map((v, idx) => {
    const date = new Date(v.timestamp);
    return `  ${idx + 1}. ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
     Type: ${(v.type || 'unspecified').replace(/_/g, ' ')}
     Location: ${v.location || 'Not specified'}`;
  })
  .join('\n')}

LOCATIONS INVOLVED
────────────────────────────────────────────────────────────────────────────────
${allLocations.length > 0 ? allLocations.join('\n') : 'No specific locations documented'}

EVIDENCE COUNT
────────────────────────────────────────────────────────────────────────────────
Total Photographic Evidence: ${totalEvidence} item(s)
Total Witnesses Referenced: ${documentedViolations.reduce((sum, v) => sum + (v.witnesses?.length || 0), 0)}

═══════════════════════════════════════════════════════════════════════════════
                          PATTERN ANALYSIS
═══════════════════════════════════════════════════════════════════════════════
${patternSummary}

═══════════════════════════════════════════════════════════════════════════════
                         IMPACT STATEMENT
═══════════════════════════════════════════════════════════════════════════════
${impactStatement}

═══════════════════════════════════════════════════════════════════════════════
                     RELEVANT VIOLATION DEFINITIONS
═══════════════════════════════════════════════════════════════════════════════
${definitions}

═══════════════════════════════════════════════════════════════════════════════
                          RELIEF SOUGHT
═══════════════════════════════════════════════════════════════════════════════
Based on the documented pattern of violations, the filing party respectfully requests:

1. Finding of contempt for willful violation of court orders
2. Modification of custody arrangement to ensure compliance
3. Makeup parenting time for missed visitation
4. Attorney's fees and costs associated with this motion
5. Any other relief the Court deems just and proper

═══════════════════════════════════════════════════════════════════════════════
                            CERTIFICATION
═══════════════════════════════════════════════════════════════════════════════
I certify that the information contained in this document is true and accurate
to the best of my knowledge. All evidence referenced herein is available for
court review upon request.

Generated: ${new Date().toISOString()}
Document ID: ${crypto.randomUUID().slice(0, 8).toUpperCase()}
═══════════════════════════════════════════════════════════════════════════════
`.trim();

    setGeneratedFiling(filing);
    toast({ title: 'Court filing generated successfully' });
  };

  const handleCopySummary = () => {
    if (!caseSummary) return;

    const text = `CASE SUMMARY: ${caseSummary.title}

ALLEGATION:
${caseSummary.allegation}

EVIDENCE:
${caseSummary.incidents
  .map(
    (inc, idx) => `
Incident ${idx + 1} (${inc.date})
- Type: ${inc.type}
- Description: ${inc.description}
${inc.location ? `- Location: ${inc.location}` : ''}
- Photos: ${inc.photoCount} attached
${inc.witnesses?.length ? `- Witnesses: ${inc.witnesses.join(', ')}` : ''}
`
  )
  .join('')}

PATTERN ANALYSIS:
${caseSummary.patterns
  .map(
    (p) => `
${p.displayType}
- Occurrences: ${p.occurrences}
- Severity: ${p.severity}
- Recommendation: ${p.courtRecommendation}
`
  )
  .join('')}

IMPACT:
${caseSummary.impact}

RELIEF SOUGHT:
${caseSummary.reliefSought}`;

    navigator.clipboard.writeText(text);
    toast({ title: 'Case summary copied to clipboard' });
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500 text-white">High</Badge>;
      case 'moderate':
        return <Badge variant="secondary">Moderate</Badge>;
      default:
        return <Badge variant="outline">Low</Badge>;
    }
  };

  if (violationsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 pb-24 md:pb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-2xl font-semibold flex items-center gap-2"
            data-testid="text-page-title"
          >
            <Scale className="h-5 w-5" />
            Case Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate court-ready case summaries from your documented evidence
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopySummary}
            disabled={!caseSummary}
            data-testid="button-copy-summary"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Summary
          </Button>
          <Button
            size="sm"
            onClick={() =>
              (window.location.href = `/api/filings/export?environment=${environment}`)
            }
            disabled={!caseSummary}
            data-testid="button-download-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Court Filing Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="narrative" className="text-sm font-medium">
              What happened?
            </Label>
            <Textarea
              id="narrative"
              placeholder="Describe the situation in your own words. For example: 'On January 3rd, the children were picked up 2 hours late without any prior notice. This has happened multiple times over the past month...'"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              className="min-h-[120px]"
              data-testid="input-narrative"
            />
            <p className="text-xs text-muted-foreground">
              The system will automatically add dates, times, locations, evidence counts, pattern
              analysis, impact statements, and legal definitions from your documented violations.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={generateCourtFiling}
              disabled={!narrative.trim()}
              data-testid="button-generate-filing"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Court Filing
            </Button>
            {generatedFiling && (
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(generatedFiling);
                  toast({ title: 'Court filing copied to clipboard' });
                }}
                data-testid="button-copy-filing"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Filing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {generatedFiling && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generated Court Filing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              className="text-xs bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono"
              data-testid="text-generated-filing"
            >
              {generatedFiling}
            </pre>
          </CardContent>
        </Card>
      )}

      {!caseSummary ? (
        <Card className="p-8 text-center">
          <div className="p-4 bg-muted rounded-full w-fit mx-auto mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-2">No documented violations yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Document your first violation to start building your case. The Case Builder will
            automatically generate court-ready summaries.
          </p>
          <Button className="mt-4" onClick={() => (window.location.href = '/violations')}>
            Document Violation
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Case Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-sm mb-1" data-testid="text-case-title">
                  {caseSummary.title}
                </h3>
                <p className="text-sm text-muted-foreground">{caseSummary.allegation}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Documented Evidence ({caseSummary.incidents.length} incidents)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {caseSummary.incidents.map((incident, idx) => (
                  <div
                    key={idx}
                    className="flex gap-4 p-3 bg-muted/50 rounded-lg"
                    data-testid={`incident-${idx}`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full shrink-0">
                      <span className="text-sm font-medium text-primary">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-sm">{incident.date}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {incident.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{incident.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        {incident.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {incident.location}
                          </span>
                        )}
                        {incident.photoCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Camera className="h-3 w-3" />
                            {incident.photoCount} photos
                          </span>
                        )}
                        {incident.witnesses && incident.witnesses.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {incident.witnesses.length} witness(es)
                          </span>
                        )}
                      </div>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {caseSummary.patterns.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Pattern Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {caseSummary.patterns.map((pattern, idx) => (
                    <div key={idx} className="p-3 border rounded-lg" data-testid={`pattern-${idx}`}>
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span className="font-medium text-sm">{pattern.displayType}</span>
                        {getSeverityBadge(pattern.severity)}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {pattern.occurrences} occurrences
                        </div>
                        {pattern.avgDelay && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Avg delay: {pattern.avgDelay}
                          </div>
                        )}
                        {pattern.locations && pattern.locations.length > 0 && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {pattern.locations.length > 2
                              ? `${pattern.locations.slice(0, 2).join(', ')} +${pattern.locations.length - 2} more`
                              : pattern.locations.join(', ')}
                          </div>
                        )}
                      </div>
                      <p className="text-xs bg-primary/5 p-2 rounded">
                        <strong>Court Recommendation:</strong> {pattern.courtRecommendation}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Impact Statement</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{caseSummary.impact}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Relief Sought</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{caseSummary.reliefSought}</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
