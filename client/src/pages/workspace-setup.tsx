import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Building, User, ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

export default function WorkspaceSetup() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  const [workspaceType, setWorkspaceType] = useState<'consumer' | 'firm'>('consumer');
  const [workspaceName, setWorkspaceName] = useState('');

  const createWorkspaceMutation = useMutation({
    mutationFn: async (data: { name: string; type: string }) => {
      const response = await apiRequest('POST', '/api/workspaces', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Workspace created',
        description: 'Your workspace has been set up successfully.',
      });
      setLocation('/dashboard');
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create workspace',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else {
      if (!workspaceName.trim()) {
        toast({
          title: 'Name required',
          description: 'Please enter a workspace name.',
          variant: 'destructive',
        });
        return;
      }
      createWorkspaceMutation.mutate({
        name: workspaceName.trim(),
        type: workspaceType,
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Set Up Your Workspace</CardTitle>
          <CardDescription>
            Step {step} of 2: {step === 1 ? 'Choose workspace type' : 'Name your workspace'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <RadioGroup
              value={workspaceType}
              onValueChange={(v) => setWorkspaceType(v as 'consumer' | 'firm')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Label
                  htmlFor="consumer"
                  className={`flex flex-col items-center gap-4 p-6 border-2 rounded-lg cursor-pointer transition-all ${
                    workspaceType === 'consumer'
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="consumer" id="consumer" className="sr-only" />
                  <User className="h-12 w-12 text-primary" />
                  <div className="text-center space-y-1">
                    <div className="font-semibold">Individual</div>
                    <div className="text-sm text-muted-foreground">
                      For individuals managing their own divorce case
                    </div>
                  </div>
                </Label>

                <Label
                  htmlFor="firm"
                  className={`flex flex-col items-center gap-4 p-6 border-2 rounded-lg cursor-pointer transition-all ${
                    workspaceType === 'firm'
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="firm" id="firm" className="sr-only" />
                  <Building className="h-12 w-12 text-primary" />
                  <div className="text-center space-y-1">
                    <div className="font-semibold">Law Firm</div>
                    <div className="text-sm text-muted-foreground">
                      For attorneys and law firms managing multiple clients
                    </div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                {workspaceType === 'consumer' ? (
                  <User className="h-8 w-8 text-primary" />
                ) : (
                  <Building className="h-8 w-8 text-primary" />
                )}
                <div>
                  <div className="font-medium">
                    {workspaceType === 'consumer' ? 'Individual Workspace' : 'Law Firm Workspace'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    You can change this later in settings
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  placeholder={
                    workspaceType === 'consumer'
                      ? 'e.g., My Divorce Case'
                      : 'e.g., Smith & Associates'
                  }
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            {step === 2 && (
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={createWorkspaceMutation.isPending}
              className={step === 1 ? 'ml-auto' : ''}
            >
              {createWorkspaceMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {step === 1 ? 'Next' : 'Create Workspace'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
