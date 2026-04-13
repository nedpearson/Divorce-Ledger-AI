import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { RecurringBillTemplate, RecurringBillCycle } from '@shared/schema';

export function useRecurringBills() {
  const queryClient = useQueryClient();

  // Get templates
  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery<RecurringBillTemplate[]>({
    queryKey: ['/api/recurring-bills/templates'],
  });

  // Get dashboard metrics
  const { data: dashboardStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/recurring-bills/dashboard'],
  });

  // Create a template
  const createTemplate = useMutation({
    mutationFn: async (payload: Partial<RecurringBillTemplate>) => {
      const res = await apiRequest('POST', '/api/recurring-bills/templates', payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-bills/templates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-bills/dashboard'] });
    },
  });

  // Update a template
  const updateTemplate = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<RecurringBillTemplate> }) => {
      const res = await apiRequest('PATCH', `/api/recurring-bills/templates/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-bills/templates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-bills/dashboard'] });
    },
  });

  // Delete a template
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/recurring-bills/templates/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-bills/templates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-bills/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/obligations/summary'] }); // Need to invalidate summary too
    },
  });

  return {
    templates,
    isLoadingTemplates,
    dashboardStats,
    isLoadingStats,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
