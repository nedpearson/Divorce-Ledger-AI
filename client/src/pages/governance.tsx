import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Shield,
  FileText,
  Database,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  Activity,
  GitBranch,
  Lock,
  Eye,
  Trash2,
  Download,
  RefreshCw,
  Play,
} from 'lucide-react';

export default function GovernanceDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: summaryData, isLoading: summaryLoading } = useQuery<{ summary: any }>({
    queryKey: ['/api/governance/summary'],
  });

  const { data: dsrData, isLoading: dsrLoading } = useQuery<{ requests: any[] }>({
    queryKey: ['/api/governance/dsr'],
  });

  const { data: policyData, isLoading: policyLoading } = useQuery<{ policies: any[] }>({
    queryKey: ['/api/governance/retention/policies'],
  });

  const { data: auditData, isLoading: auditLoading } = useQuery<{ entries: any[] }>({
    queryKey: ['/api/governance/audit'],
  });

  const { data: lineageData, isLoading: lineageLoading } = useQuery<{
    nodes: any[];
    edges: any[];
    sources: any[];
  }>({
    queryKey: ['/api/governance/lineage/graph'],
  });

  const { data: qualityData, isLoading: qualityLoading } = useQuery<{ tests: any[] }>({
    queryKey: ['/api/governance/quality/tests'],
  });

  const executeRetentionMutation = useMutation({
    mutationFn: async (policyId: string) => {
      return apiRequest('POST', `/api/governance/retention/execute/${policyId}`);
    },
    onSuccess: () => {
      toast({
        title: 'Retention job started',
        description: 'The retention policy is now executing in the background.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/governance/retention/jobs'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Execution failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runQualityTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      return apiRequest('POST', `/api/governance/quality/tests/${testId}/run`);
    },
    onSuccess: (data: any) => {
      toast({
        title: data.run?.passed ? 'Test passed' : 'Test failed',
        description: data.run?.passed
          ? 'Data quality test completed successfully'
          : 'Data quality test found issues',
        variant: data.run?.passed ? 'default' : 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/governance/quality/tests'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Test failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const summary = summaryData?.summary;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="sticky top-0 z-sticky bg-background border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold">Data Governance</h1>
              <p className="text-sm text-muted-foreground">
                Privacy compliance, data lineage, and quality management
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/governance'] })}
            data-testid="button-refresh-governance"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {summaryLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <Database className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">PII Fields Tracked</p>
                    <p className="text-2xl font-semibold" data-testid="text-pii-count">
                      {summary?.piiFieldsTracked || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                    <FileText className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pending DSRs</p>
                    <p className="text-2xl font-semibold" data-testid="text-pending-dsr">
                      {summary?.pendingDataRequests || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <Clock className="h-5 w-5 text-green-600 dark:text-green-300" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Policies</p>
                    <p className="text-2xl font-semibold" data-testid="text-policies-count">
                      {summary?.activeRetentionPolicies || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                    <Activity className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Audit Events (24h)</p>
                    <p className="text-2xl font-semibold" data-testid="text-audit-count">
                      {summary?.auditEventsLast24h || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-100 dark:bg-teal-900 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-teal-600 dark:text-teal-300" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Quality Tests</p>
                    <p className="text-2xl font-semibold" data-testid="text-quality-tests">
                      {summary?.activeQualityTests || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Shield className="h-4 w-4 mr-1" /> Overview
            </TabsTrigger>
            <TabsTrigger value="dsr" data-testid="tab-dsr">
              <Users className="h-4 w-4 mr-1" /> Data Subject Requests
            </TabsTrigger>
            <TabsTrigger value="retention" data-testid="tab-retention">
              <Clock className="h-4 w-4 mr-1" /> Retention Policies
            </TabsTrigger>
            <TabsTrigger value="lineage" data-testid="tab-lineage">
              <GitBranch className="h-4 w-4 mr-1" /> Data Lineage
            </TabsTrigger>
            <TabsTrigger value="quality" data-testid="tab-quality">
              <CheckCircle className="h-4 w-4 mr-1" /> Data Quality
            </TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit">
              <Eye className="h-4 w-4 mr-1" /> Audit Trail
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Compliance Status</CardTitle>
                  <CardDescription>GDPR and CCPA compliance overview</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-600" />
                      <span>GDPR Compliance</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    >
                      Compliant
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-600" />
                      <span>CCPA Compliance</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    >
                      Compliant
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-green-600" />
                      <span>Data Encryption</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    >
                      AES-256-GCM
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Activity</CardTitle>
                  <CardDescription>Latest governance events</CardDescription>
                </CardHeader>
                <CardContent>
                  {auditLoading ? (
                    <div className="space-y-2">
                      {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-10" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(auditData?.entries || []).slice(0, 5).map((entry: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 border rounded text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Activity className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{entry.action}</span>
                            <span className="text-muted-foreground">{entry.resourceType}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                      {(!auditData?.entries || auditData.entries.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No recent activity
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="dsr" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Data Subject Requests</CardTitle>
                  <CardDescription>
                    GDPR/CCPA access, erasure, and portability requests
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {dsrLoading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Request ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Regulation</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dsrData?.requests || []).map((req: any) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-mono text-xs">{req.id.slice(0, 8)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {req.requestType === 'access' && <Eye className="h-3 w-3 mr-1" />}
                              {req.requestType === 'erasure' && <Trash2 className="h-3 w-3 mr-1" />}
                              {req.requestType === 'portability' && (
                                <Download className="h-3 w-3 mr-1" />
                              )}
                              {req.requestType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{req.regulationType.toUpperCase()}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                req.status === 'completed'
                                  ? 'default'
                                  : req.status === 'pending'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {req.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{new Date(req.deadlineAt).toLocaleDateString()}</TableCell>
                          <TableCell>{new Date(req.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                      {(!dsrData?.requests || dsrData.requests.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No data subject requests
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="retention" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Retention Policies</CardTitle>
                <CardDescription>Data lifecycle and archival rules</CardDescription>
              </CardHeader>
              <CardContent>
                {policyLoading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Policy Name</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead>Retention (Days)</TableHead>
                        <TableHead>Purge Mode</TableHead>
                        <TableHead>Last Executed</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(policyData?.policies || []).map((policy: any) => (
                        <TableRow key={policy.id}>
                          <TableCell className="font-medium">{policy.name}</TableCell>
                          <TableCell className="font-mono text-sm">{policy.tableName}</TableCell>
                          <TableCell>{policy.retentionPeriodDays}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{policy.purgeMode}</Badge>
                          </TableCell>
                          <TableCell>
                            {policy.lastExecutedAt
                              ? new Date(policy.lastExecutedAt).toLocaleString()
                              : 'Never'}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => executeRetentionMutation.mutate(policy.id)}
                              disabled={executeRetentionMutation.isPending}
                              data-testid={`button-execute-policy-${policy.id}`}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Execute
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!policyData?.policies || policyData.policies.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No retention policies configured
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lineage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Lineage Graph</CardTitle>
                <CardDescription>
                  Visual representation of data flow through the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                {lineageLoading ? (
                  <Skeleton className="h-64" />
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground">Data Nodes</p>
                        <p className="text-2xl font-semibold">{lineageData?.nodes?.length || 0}</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground">Data Edges</p>
                        <p className="text-2xl font-semibold">{lineageData?.edges?.length || 0}</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground">Data Sources</p>
                        <p className="text-2xl font-semibold">
                          {lineageData?.sources?.length || 0}
                        </p>
                      </div>
                    </div>

                    {(lineageData?.nodes?.length || 0) > 0 ? (
                      <div className="border rounded-lg p-4 bg-muted/30">
                        <p className="text-sm font-medium mb-2">Lineage Nodes</p>
                        <div className="flex flex-wrap gap-2">
                          {lineageData?.nodes?.map((node: any) => (
                            <Badge key={node.id} variant="outline" className="font-mono">
                              {node.label} ({node.entityType})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <GitBranch className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No lineage data configured yet</p>
                        <p className="text-sm">
                          Add data sources and transformations to build the lineage graph
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quality" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Quality Tests</CardTitle>
                <CardDescription>Automated data validation and integrity checks</CardDescription>
              </CardHeader>
              <CardContent>
                {qualityLoading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Test Name</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Last Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(qualityData?.tests || []).map((test: any) => (
                        <TableRow key={test.id}>
                          <TableCell className="font-medium">{test.name}</TableCell>
                          <TableCell className="font-mono text-sm">{test.tableName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{test.testType}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                test.severity === 'critical'
                                  ? 'destructive'
                                  : test.severity === 'high'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              {test.severity}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {test.lastRunStatus ? (
                              <Badge
                                variant={
                                  test.lastRunStatus === 'passed' ? 'default' : 'destructive'
                                }
                              >
                                {test.lastRunStatus}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">Not run</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runQualityTestMutation.mutate(test.id)}
                              disabled={runQualityTestMutation.isPending}
                              data-testid={`button-run-test-${test.id}`}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Run
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!qualityData?.tests || qualityData.tests.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No quality tests configured
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Audit Trail</CardTitle>
                <CardDescription>System activity and access logs</CardDescription>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(auditData?.entries || []).slice(0, 20).map((entry: any) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-xs">
                            {new Date(entry.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{entry.action}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{entry.resourceType}</TableCell>
                          <TableCell>{entry.userId || 'System'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {entry.ipAddress || '-'}
                          </TableCell>
                          <TableCell>
                            {entry.responseStatus && (
                              <Badge
                                variant={entry.responseStatus < 400 ? 'default' : 'destructive'}
                              >
                                {entry.responseStatus}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!auditData?.entries || auditData.entries.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No audit entries
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
