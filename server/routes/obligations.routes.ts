import { Router } from 'express';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, or, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/authz';

export const obligationsRouter = Router();

// ==========================================
// 1. OBLIGATIONS API (UNIFIED LEDGER)
// ==========================================

// Get pending obligation instances for review (from AI Pipeline)
obligationsRouter.get('/pending', requireAuth, async (req, res) => {
  try {
    const instances = await db.select({
      id: schema.obligationInstances.id,
      documentId: schema.obligationInstances.documentId,
      caseId: schema.obligationInstances.caseId,
      category: schema.obligationInstances.category,
      vendor: schema.obligationInstances.vendor,
      amountGross: schema.obligationInstances.amountGross,
      partyAOwed: schema.obligationInstances.partyAOwed,
      partyBOwed: schema.obligationInstances.partyBOwed,
      direction: schema.obligationInstances.direction,
      dueDate: schema.obligationInstances.dueDate,
      confidenceScore: schema.obligationInstances.confidenceScore,
      reviewStatus: schema.obligationInstances.reviewStatus,
      createdAt: schema.obligationInstances.createdAt,
      document: {
        fileName: schema.documents.fileName,
        fileUrl: schema.documents.fileUrl,
        mimeType: schema.documents.fileType
      }
    })
    .from(schema.obligationInstances)
    .leftJoin(schema.documents, eq(schema.obligationInstances.documentId, schema.documents.id))
    .where(eq(schema.obligationInstances.reviewStatus, 'needs_review'))
    .orderBy(desc(schema.obligationInstances.createdAt));

    res.json(instances);
  } catch (error) {
    console.error('[Obligations API Error]', error);
    res.status(500).json({ error: 'Failed to fetch pending obligations' });
  }
});

// Resolve (Approve/Reject/Edit) a pending AI obligation
obligationsRouter.post('/:id/resolve', requireAuth, async (req, res) => {
  try {
    const { action, editedData } = req.body; 

    const [instance] = await db.select().from(schema.obligationInstances)
      .where(eq(schema.obligationInstances.id, req.params.id));

    if (!instance) return res.status(404).json({ error: 'Obligation instance not found' });

    let finalStatus = 'needs_review';
    let updates: any = {};

    if (action === 'approve') {
      finalStatus = 'approved';
      updates = { reviewStatus: 'approved' };
    } else if (action === 'reject') {
      finalStatus = 'rejected';
      updates = { reviewStatus: 'rejected' };
    } else if (action === 'edit_and_approve' && editedData) {
      finalStatus = 'approved';
      updates = { 
        reviewStatus: 'approved',
        amountGross: editedData.amountGross,
        partyAOwed: editedData.partyAOwed,
        partyBOwed: editedData.partyBOwed,
        direction: editedData.direction || 'due_from_spouse',
        category: editedData.category,
        vendor: editedData.vendor,
        dueDate: editedData.dueDate
      };
    }

    // Default remaining balance matches gross for new approved items
    if (finalStatus === 'approved') {
        const amt = editedData?.amountGross ?? instance.amountGross;
        updates.remainingBalance = amt;
        updates.status = 'pending'; // Meaning unpaid
    }

    const [updated] = await db.update(schema.obligationInstances)
      .set(updates)
      .where(eq(schema.obligationInstances.id, instance.id))
      .returning();

    // Note: We no longer silently insert into childSupportPayments. 
    // The obligation instance IS the ledger item for child support now.

    res.json(updated);
  } catch (error) {
    console.error('[Obligations Resolution Error]', error);
    res.status(500).json({ error: 'Failed to resolve obligation instance' });
  }
});

// Get comprehensive financial summary (Due To, Due From, Net, Child Support)
obligationsRouter.get('/summary', requireAuth, async (req, res) => {
  try {
    const instances = await db.select({
      id: schema.obligationInstances.id,
      category: schema.obligationInstances.category,
      vendor: schema.obligationInstances.vendor,
      amountGross: schema.obligationInstances.amountGross,
      direction: schema.obligationInstances.direction,
      dueDate: schema.obligationInstances.dueDate,
      status: schema.obligationInstances.status,
      remainingBalance: schema.obligationInstances.remainingBalance,
      reviewStatus: schema.obligationInstances.reviewStatus,
      createdAt: schema.obligationInstances.createdAt,
      isArrearage: schema.obligationInstances.isArrearage,
      document: {
        id: schema.documents.id,
        fileName: schema.documents.fileName,
        fileUrl: schema.documents.fileUrl
      },
      rule: {
        id: schema.obligationRules.id,
        partyBPercentage: schema.obligationRules.partyBPercentage,
        partyAPercentage: schema.obligationRules.partyAPercentage
      }
    })
    .from(schema.obligationInstances)
    .leftJoin(schema.documents, eq(schema.obligationInstances.documentId, schema.documents.id))
    .leftJoin(schema.obligationRules, eq(schema.obligationInstances.ruleId, schema.obligationRules.id))
    .where(eq(schema.obligationInstances.reviewStatus, 'approved'))
    .orderBy(desc(schema.obligationInstances.createdAt));

    const totals = {
      dueFromSpouse: 0,
      dueToSpouse: 0,
      netPosition: 0,
      
      childSupportDue: 0,
      childSupportOverdue: 0,
      childSupportArrears: 0,
      
      upcomingObligations: 0,
      overdueObligations: 0,
      pendingReimbursements: 0,
      
      openCount: 0,
      overdueCount: 0,
      
      hasMissingBills: false,
      missingBillsCount: 0
    };

    // Check for missing bills to flag incomplete states
    const environment = (req.headers['x-environment'] || 'demo') as string;
    const userId = (req.user as any).id;
    const missingCyclesCountResult = await db.select({ count: sql`COUNT(*)` })
      .from(schema.recurringBillCycles)
      .innerJoin(schema.recurringBillTemplates, eq(schema.recurringBillCycles.recurringBillTemplateId, schema.recurringBillTemplates.id))
      .where(and(
        eq(schema.recurringBillTemplates.userId, userId),
        eq(schema.recurringBillTemplates.environment, environment),
        eq(schema.recurringBillCycles.missingFlag, true)
      ));
    
    if (missingCyclesCountResult[0] && Number(missingCyclesCountResult[0].count) > 0) {
      totals.hasMissingBills = true;
      totals.missingBillsCount = Number(missingCyclesCountResult[0].count);
    }

    const now = new Date();

    instances.forEach(record => {
      // Base value is the remaining balance, or the gross amount if not tracked yet
      const amount = record.remainingBalance ?? record.amountGross;

      if (amount <= 0 || record.status === 'paid') return;

      const isOverdue = record.dueDate && new Date(record.dueDate) < now;
      const isChildSupport = record.category === 'child_support' || record.category === 'alimony';

      // 1. Directional Accumulation
      if (record.direction === 'due_from_spouse') {
        totals.dueFromSpouse += amount;
        totals.openCount++;
        
        if (isOverdue) totals.overdueObligations += amount;
        else totals.upcomingObligations += amount;

        if (record.category === 'reimbursement') totals.pendingReimbursements += amount;

      } else if (record.direction === 'due_to_spouse') {
        totals.dueToSpouse += amount;
      }

      // 2. Child Support Explicit Math
      if (isChildSupport) {
        totals.childSupportDue += amount;
        if (isOverdue) totals.childSupportOverdue += amount;
        if (record.isArrearage) totals.childSupportArrears += amount;
      }

      // Track general overdue counts
      if (isOverdue) totals.overdueCount++;
    });

    totals.netPosition = totals.dueFromSpouse - totals.dueToSpouse;

    res.json({ totals, records: instances });

  } catch (error) {
    console.error('[Obligations Summary Error]', error);
    res.status(500).json({ error: 'Failed to fetch obligations summary' });
  }
});

// Create manual obligation (Child Support, Direct Expense)
obligationsRouter.post('/', requireAuth, async (req, res) => {
  try {
    const { title, category, amountGross, direction, dueDate, isRecurring, recurrenceFrequency, notes, historicalStartDate, historicalEndDate } = req.body;
    
    // Convert float input to cents internally
    const amountCents = Math.round(parseFloat(amountGross) * 100);
    const inserts = [];

    if (isRecurring && historicalStartDate && historicalEndDate) {
      let currentDate = new Date(historicalStartDate);
      const end = new Date(historicalEndDate);
      
      while (currentDate <= end) {
        inserts.push({
          caseId: 'pending-assignment',
          title,
          category,
          amountGross: amountCents,
          remainingBalance: amountCents,
          direction: direction || 'due_from_spouse',
          dueDate: currentDate.toISOString().split('T')[0],
          isRecurring: !!isRecurring,
          recurrenceFrequency,
          description: notes,
          reviewStatus: 'approved',
          status: 'pending'
        });
        
        // Increment date based on frequency
        if (recurrenceFrequency === 'monthly') currentDate.setMonth(currentDate.getMonth() + 1);
        else if (recurrenceFrequency === 'weekly') currentDate.setDate(currentDate.getDate() + 7);
        else if (recurrenceFrequency === 'biweekly') currentDate.setDate(currentDate.getDate() + 14);
        else break;
      }
    } else {
      inserts.push({
        caseId: 'pending-assignment',
        title,
        category,
        amountGross: amountCents,
        remainingBalance: amountCents,
        direction: direction || 'due_from_spouse',
        dueDate,
        isRecurring: !!isRecurring,
        recurrenceFrequency,
        description: notes,
        reviewStatus: 'approved',
        status: 'pending'
      });
    }

    const inserted = await db.insert(schema.obligationInstances).values(inserts).returning();
    res.json(inserted);
  } catch (error) {
    console.error('[Obligations Create Error]', error);
    res.status(500).json({ error: 'Failed to create obligation' });
  }
});

// Edit existing obligation
obligationsRouter.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { title, category, amountGross, direction, dueDate, description } = req.body;
    const amountCents = amountGross ? Math.round(parseFloat(amountGross) * 100) : undefined;
    
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (category !== undefined) updates.category = category;
    if (direction !== undefined) updates.direction = direction;
    if (dueDate !== undefined) updates.dueDate = dueDate;
    if (description !== undefined) updates.description = description;
    
    if (amountCents !== undefined) {
       updates.amountGross = amountCents;
       updates.remainingBalance = amountCents; // resetting balance on edit
    }

    const [updated] = await db.update(schema.obligationInstances)
      .set(updates)
      .where(eq(schema.obligationInstances.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Instance not found' });
    res.json(updated);
  } catch (error) {
    console.error('[Obligations Edit Error]', error);
    res.status(500).json({ error: 'Failed to edit obligation' });
  }
});


// Mark obligation as paid
obligationsRouter.post('/:id/pay', requireAuth, async (req, res) => {
  try {
    const [updated] = await db.update(schema.obligationInstances)
      .set({ status: 'paid', remainingBalance: 0 })
      .where(eq(schema.obligationInstances.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Instance not found' });
    res.json(updated);
  } catch (error) {
    console.error('[Obligations Pay Error]', error);
    res.status(500).json({ error: 'Failed to mark obligation as paid' });
  }
});

// Delete obligation
obligationsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.delete(schema.obligationInstances).where(eq(schema.obligationInstances.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('[Obligations Delete Error]', error);
    res.status(500).json({ error: 'Failed to delete obligation' });
  }
});


// Get obligation rules (category percentages)
obligationsRouter.get('/rules', requireAuth, async (req, res) => {
  try {
    const rules = await db.select().from(schema.obligationRules).orderBy(desc(schema.obligationRules.createdAt));
    res.json(rules);
  } catch (error) {
    console.error('[Obligations Rules error]', error);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// Delete obligation rule
obligationsRouter.delete('/rules/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(schema.obligationRules).where(eq(schema.obligationRules.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('[Obligations Delete Rule error]', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});
// Create obligation rule
obligationsRouter.post('/rules', requireAuth, async (req, res) => {
  try {
    const { 
      ruleType, category, partyAPercentage, partyBPercentage, fixedAmount, 
      keywords, effectiveStartDate, notes, title,
      dueDate, isRecurring, recurrenceFrequency, historicalStartDate, historicalEndDate 
    } = req.body;
    
    // Auto-update any existing rule for this category to inactive ONLY if it's a general category rule without keywords
    // To support multiple keyword rules per category, we only disable if keywords are empty and category matches
    if (category && (!keywords || keywords.trim() === '')) {
       await db.update(schema.obligationRules)
         .set({ isActive: false })
         .where(eq(schema.obligationRules.category, category));
    }

    const amountCents = fixedAmount ? Math.round(parseFloat(fixedAmount) * 100) : null;

    const [inserted] = await db.insert(schema.obligationRules).values({
      caseId: 'pending-assignment',
      ruleType: ruleType || 'percentage_split',
      category,
      partyAPercentage,
      partyBPercentage,
      fixedAmount: amountCents,
      keywords,
      effectiveStartDate,
      notes: notes || title,
      isActive: true
    }).returning();

    // Generate Retroactive Obligations if a start date and keywords are provided
    if (inserted && inserted.keywords && inserted.effectiveStartDate) {
      console.log(`[Obligations] Processing historical documents since ${inserted.effectiveStartDate} for rule ${inserted.id}`);
      const keywordList = inserted.keywords.split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
      
      const overrideEnv = (req.headers['x-environment'] as string) || 'demo';
      const requestUserId = (req.headers['x-user-id'] as string) || (req as any).session?.userId || (req as any).user?.id || 'demo-client-user';

      const pastResults = await db.select({
        expenseId: schema.expenses.id,
        documentId: schema.expenses.documentId,
        vendorName: schema.expenses.vendor,
        amount: schema.expenses.amount, 
        startDate: schema.expenses.startDate,
        description: schema.expenses.description
      })
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.environment, overrideEnv),
          eq(schema.expenses.userId, requestUserId)
        )
      );

      const matches = pastResults.filter(pr => {
         const docDateStr = pr.startDate || '';
         if (!docDateStr) return false;
         
         const isAfterStart = new Date(docDateStr) >= new Date(inserted.effectiveStartDate!);
         if (!isAfterStart) return false;

         const textToSearch = `${pr.vendorName || ''} ${pr.description || ''}`.toLowerCase();
         return keywordList.some(kw => textToSearch.includes(kw));
      });

      console.log(`[Obligations] Found ${matches.length} historical matches for rule ${inserted.id}`);
      
      for (const match of matches) {
         if (!match.expenseId) continue;
         const baseAmount = match.amount ? Number(match.amount) : 0; // already in cents
         const amountGross = inserted.ruleType === 'fixed_amount' && inserted.fixedAmount ? inserted.fixedAmount : baseAmount;
         
         if (amountGross > 0) {
            let partyAOwed = null;
            let partyBOwed = null;
            if (inserted.ruleType === 'percentage_split') {
              if (inserted.partyAPercentage) partyAOwed = Math.round(amountGross * (inserted.partyAPercentage / 100));
              if (inserted.partyBPercentage) partyBOwed = Math.round(amountGross * (inserted.partyBPercentage / 100));
            }
            try {
              await db.insert(schema.obligationInstances).values({
                 caseId: 'pending-assignment',
                 documentId: match.documentId || match.expenseId,
                 ruleId: inserted.id,
                 category: inserted.category || 'other',
                 vendor: match.vendorName || 'Auto-Matched Vendor',
                 amountGross,
                 partyAOwed,
                 partyBOwed,
                 remainingBalance: partyBOwed !== null ? partyBOwed : amountGross,
                 direction: 'due_from_spouse',
                 dueDate: match.startDate,
                 isAiComputed: false,
                 confidenceScore: 0.9,
                 reviewStatus: 'approved',
                 environment: overrideEnv
              });
            } catch (err) {
              console.error(`Failed retroactive insert for expense ${match.expenseId}:`, err);
            }
         }
      }
    }

    // 2. Generate Scheduled programmatic recurrences if `dueDate` or `isRecurring` is provided
    if (inserted && (dueDate || isRecurring)) {
       const baseAmount = amountCents || 0;
       console.log(`[Obligations] Generating recurring schedule items for rule ${inserted.id} w/ base = ${baseAmount}`);
       const inserts = [];

       if (isRecurring && historicalStartDate && historicalEndDate) {
         let currentDate = new Date(historicalStartDate);
         const end = new Date(historicalEndDate);
         
         while (currentDate <= end) {
           let partyAOwed = null;
           let partyBOwed = null;
           if (inserted.ruleType === 'percentage_split') {
             if (inserted.partyAPercentage) partyAOwed = Math.round(baseAmount * (inserted.partyAPercentage / 100));
             if (inserted.partyBPercentage) partyBOwed = Math.round(baseAmount * (inserted.partyBPercentage / 100));
           }

           inserts.push({
             caseId: 'pending-assignment',
             ruleId: inserted.id,
             category: inserted.category || 'other',
             amountGross: baseAmount,
             partyAOwed,
             partyBOwed,
             remainingBalance: baseAmount,
             direction: 'due_from_spouse', // Default for these rules
             dueDate: currentDate.toISOString().split('T')[0],
             isRecurring: !!isRecurring,
             recurrenceFrequency,
             description: inserted.notes,
             reviewStatus: 'approved', // If explicitly scheduled, auto-approve
             status: 'pending',
             environment: (req.headers['x-environment'] || 'demo') as string
           });
           
           if (recurrenceFrequency === 'monthly') currentDate.setMonth(currentDate.getMonth() + 1);
           else if (recurrenceFrequency === 'weekly') currentDate.setDate(currentDate.getDate() + 7);
           else if (recurrenceFrequency === 'biweekly') currentDate.setDate(currentDate.getDate() + 14);
           else break;
         }
       } else if (dueDate || isRecurring) {
         const fallbackDate = dueDate || new Date().toISOString().split('T')[0];
         let partyAOwed = null;
         let partyBOwed = null;
         if (inserted.ruleType === 'percentage_split') {
           if (inserted.partyAPercentage) partyAOwed = Math.round(baseAmount * (inserted.partyAPercentage / 100));
           if (inserted.partyBPercentage) partyBOwed = Math.round(baseAmount * (inserted.partyBPercentage / 100));
         }

         inserts.push({
           caseId: 'pending-assignment',
           ruleId: inserted.id,
           category: inserted.category || 'other',
           amountGross: baseAmount,
           partyAOwed,
           partyBOwed,
           remainingBalance: baseAmount,
           direction: 'due_from_spouse',
           dueDate: fallbackDate,
           isRecurring: !!isRecurring,
           recurrenceFrequency,
           description: inserted.notes,
           reviewStatus: 'approved',
           status: 'pending',
           environment: (req.headers['x-environment'] || 'demo') as string
         });
       }

       if (inserts.length > 0) {
         await db.insert(schema.obligationInstances).values(inserts);
         console.log(`[Obligations] Inserted ${inserts.length} scheduled occurrences for rule ${inserted.id}`);
       }
    }

    res.json(inserted);
  } catch (error) {
    console.error('[Obligations Create Rule Error]', error);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});
