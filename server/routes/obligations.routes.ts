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
