import { Router } from 'express';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/authz';

export const obligationsRouter = Router();

// Get pending obligation instances for review
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

// Resolve (Approve/Reject/Edit) a pending obligation
obligationsRouter.post('/:id/resolve', requireAuth, async (req, res) => {
  try {
    const { action, editedData } = req.body; 
    // action: 'approve' | 'reject' | 'edit_and_approve'

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
        category: editedData.category,
        vendor: editedData.vendor,
        dueDate: editedData.dueDate
      };
    }

    const [updated] = await db.update(schema.obligationInstances)
      .set(updates)
      .where(eq(schema.obligationInstances.id, instance.id))
      .returning();

    // If approved, create corresponding financial records.
    if (finalStatus === 'approved') {
       const mappedType = ['child_support', 'alimony'].includes(updated.category || '') 
                            ? updated.category 
                            : 'child_support'; // fallback if not explicitly alimony

       const userId = (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';

       await db.insert(schema.childSupportPayments).values({
         userId: userId,
         paymentType: mappedType as string,
         amount: updated.amountGross,
         dueDate: updated.dueDate ? new Date(updated.dueDate) : new Date(),
         status: 'pending',
         courtOrderId: updated.documentId,
         environment: updated.environment
       });
       console.log(`[Obligation API] Successfully pushed verified AI obligation directly to Ledger for category [${mappedType}].`);
    }

    res.json(updated);
  } catch (error) {
    console.error('[Obligations Resolution Error]', error);
    res.status(500).json({ error: 'Failed to resolve obligation instance' });
  }
});

// Get detailed Due From Spouse dashboard data
obligationsRouter.get('/due-from-spouse', requireAuth, async (req, res) => {
  try {
    const instances = await db.select({
      id: schema.obligationInstances.id,
      category: schema.obligationInstances.category,
      vendor: schema.obligationInstances.vendor,
      amountGross: schema.obligationInstances.amountGross,
      partyAOwed: schema.obligationInstances.partyAOwed,
      partyBOwed: schema.obligationInstances.partyBOwed,
      dueDate: schema.obligationInstances.dueDate,
      status: schema.obligationInstances.status,
      reviewStatus: schema.obligationInstances.reviewStatus,
      createdAt: schema.obligationInstances.createdAt,
      document: {
        id: schema.documents.id,
        fileName: schema.documents.fileName,
        fileUrl: schema.documents.fileUrl
      },
      rule: {
        id: schema.obligationRules.id,
        partyBPercentage: schema.obligationRules.partyBPercentage,
        effectiveStartDate: schema.obligationRules.effectiveStartDate
      },
      citation: {
        pageNumber: schema.sourceCitations.pageNumber,
        snippet: schema.sourceCitations.snippet,
        explanation: schema.sourceCitations.explanation
      }
    })
    .from(schema.obligationInstances)
    .leftJoin(schema.documents, eq(schema.obligationInstances.documentId, schema.documents.id))
    .leftJoin(schema.obligationRules, eq(schema.obligationInstances.ruleId, schema.obligationRules.id))
    .leftJoin(schema.sourceCitations, eq(schema.obligationInstances.id, schema.sourceCitations.targetId))
    .where(eq(schema.obligationInstances.reviewStatus, 'approved'))
    .orderBy(desc(schema.obligationInstances.createdAt));

    const totals = {
      outstanding: 0,
      pastDue: 0,
      pendingReimbursement: 0,
      upcomingDue: 0,
      openCount: 0,
      overdueCount: 0,
      disputedCount: 0
    };

    const now = new Date();

    instances.forEach(record => {
      // Assuming Spouse is Party B. Fallback to extracting from Gross if percentage but no parsed PartyB
      let spouseAmount = record.partyBOwed || 0; 
      if (spouseAmount === 0 && record.amountGross && record.rule?.partyBPercentage) {
        spouseAmount = Math.round(record.amountGross * (record.rule.partyBPercentage / 100));
      }

      if (spouseAmount > 0) {
        if (record.status === 'pending') {
          totals.outstanding += spouseAmount;
          totals.openCount++;

          if (record.dueDate && new Date(record.dueDate) < now) {
            totals.pastDue += spouseAmount;
            totals.overdueCount++;
          } else {
            totals.upcomingDue += spouseAmount;
          }
        }
        if (record.status === 'disputed') {
          totals.disputedCount++;
        }
      }
    });

    res.json({ totals, records: instances });

  } catch (error) {
    console.error('[Spouse Obligations Error]', error);
    res.status(500).json({ error: 'Failed to fetch spouse obligations' });
  }
});
