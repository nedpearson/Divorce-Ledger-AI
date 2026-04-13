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
      overdueCount: 0
    };

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
      if (isChildSupport && record.direction === 'due_from_spouse') {
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
    const { title, category, amountGross, direction, dueDate, isRecurring, recurrenceFrequency, notes } = req.body;
    
    // Convert float input to cents internally
    const amountCents = Math.round(parseFloat(amountGross) * 100);

    const [inserted] = await db.insert(schema.obligationInstances).values({
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
    }).returning();

    res.json(inserted);
  } catch (error) {
    console.error('[Obligations Create Error]', error);
    res.status(500).json({ error: 'Failed to create obligation' });
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

// Create obligation rule
obligationsRouter.post('/rules', requireAuth, async (req, res) => {
  try {
    const { category, partyAPercentage, partyBPercentage, effectiveStartDate, notes } = req.body;
    
    // Auto-update any existing rule for this category to inactive?
    if (category) {
       await db.update(schema.obligationRules)
         .set({ isActive: false })
         .where(eq(schema.obligationRules.category, category));
    }

    const [inserted] = await db.insert(schema.obligationRules).values({
      caseId: 'pending-assignment',
      ruleType: 'percentage_split',
      category,
      partyAPercentage,
      partyBPercentage,
      effectiveStartDate,
      notes,
      isActive: true
    }).returning();

    res.json(inserted);
  } catch (error) {
    console.error('[Obligations Create Rule Error]', error);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});
