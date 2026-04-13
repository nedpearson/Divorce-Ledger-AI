import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, PlusIcon, SettingsIcon, AlertTriangle, Trash2, Pencil } from 'lucide-react';
import { useRecurringBills } from '@/hooks/use-recurring-bills';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RecurringBillsManager() {
  const { templates, isLoadingTemplates, createTemplate, updateTemplate, deleteTemplate } = useRecurringBills();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  
  // Basic form state
  const [vendorName, setVendorName] = useState('');
  const [billName, setBillName] = useState('');
  const [category, setCategory] = useState('Utilities');
  const [expectedDayOfMonth, setExpectedDayOfMonth] = useState('1');

  const handleAdd = () => {
    createTemplate.mutate({
      vendorName,
      billName,
      category,
      expectedDayOfMonth: parseInt(expectedDayOfMonth),
      expectedFrequency: 'monthly',
      splitType: 'custom',
      splitPercentageSpouse: '50'
    }, {
      onSuccess: () => {
        setIsAddOpen(false);
        resetForm();
      }
    });
  };

  const handleEdit = (id: string) => {
    updateTemplate.mutate({
      id,
      payload: {
        vendorName,
        billName,
        category,
        expectedDayOfMonth: parseInt(expectedDayOfMonth),
      }
    }, {
      onSuccess: () => {
        setEditingTemplateId(null);
        resetForm();
      }
    });
  };

  const openEdit = (t: any) => {
    setVendorName(t.vendorName);
    setBillName(t.billName);
    setCategory(t.category);
    setExpectedDayOfMonth(t.expectedDayOfMonth?.toString() || '1');
    setEditingTemplateId(t.id);
  };

  const resetForm = () => {
    setVendorName('');
    setBillName('');
    setCategory('Utilities');
    setExpectedDayOfMonth('1');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Expected Monthly Bills</CardTitle>
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <PlusIcon className="w-4 h-4 mr-2" />
              Add Bill
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Expected Monthly Bill</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Vendor Name</label>
                <Input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="e.g. PG&E" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Bill Name (Alias)</label>
                <Input value={billName} onChange={e => setBillName(e.target.value)} placeholder="e.g. Home Electric" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Expected Day of Month</label>
                <Input type="number" min="1" max="31" value={expectedDayOfMonth} onChange={e => setExpectedDayOfMonth(e.target.value)} />
              </div>
              <Button onClick={handleAdd} disabled={createTemplate.isPending} className="w-full">
                {createTemplate.isPending ? 'Saving...' : 'Save Bill'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoadingTemplates ? (
          <div>Loading bills...</div>
        ) : templates?.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground flex flex-col items-center">
            <CalendarIcon className="w-8 h-8 mb-2 opacity-20" />
            <p>No expected weekly or monthly bills set up yet.</p>
            <p className="text-sm">Add your obligations to get missing bill alerts.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <Dialog key={t.id} open={editingTemplateId === t.id} onOpenChange={(open) => {
                if(!open) setEditingTemplateId(null);
              }}>
                <div className="flex justify-between items-center p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div>
                    <div className="font-semibold">{t.billName}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      {t.vendorName} • {t.category} 
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <div className="text-sm font-medium">Due ~Day {t.expectedDayOfMonth}</div>
                      <Badge variant="outline" className="mt-1">Active</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)} className="h-8 w-8 text-muted-foreground hover:text-primary">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <Button variant="ghost" size="icon" onClick={() => deleteTemplate.mutate(t.id)} disabled={deleteTemplate.isPending} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Expected Monthly Bill</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Vendor Name</label>
                      <Input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="e.g. PG&E" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Bill Name (Alias)</label>
                      <Input value={billName} onChange={e => setBillName(e.target.value)} placeholder="e.g. Home Electric" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Expected Day of Month</label>
                      <Input type="number" min="1" max="31" value={expectedDayOfMonth} onChange={e => setExpectedDayOfMonth(e.target.value)} />
                    </div>
                    <Button onClick={() => handleEdit(t.id)} disabled={updateTemplate.isPending} className="w-full">
                      {updateTemplate.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
