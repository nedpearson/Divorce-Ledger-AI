import { Router } from 'express';
import { z } from 'zod';
import { drilldownRequestSchema, DrilldownResponse } from '../../shared/drilldown-schema';
import { requireAuth } from '../middleware/authz';

export const lineageRouter = Router();

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';

lineageRouter.get('/explain', requireAuth, async (req, res) => {
  try {
    const querySchema = z.object({
      layer: z.coerce.number().int().min(1).max(6).default(1),
      sourceEntity: z.enum([
        'financial_summary', 'kpi_metric', 'data_sync_proposal',
        'financial_category', 'financial_record', 'document',
        'workflow_state', 'chart_segment', 'audit_log', 'violation',
      ]),
      identifier: z.string().max(256).regex(/^[\w\-.:@]+$/, 'Invalid identifier'),
      type: z.enum(['income', 'expense', 'asset', 'debt', 'violation']).optional(),
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid query parameters', errors: parsed.error.flatten() });
    }
    const { layer, sourceEntity, identifier } = parsed.data;
    const type = parsed.data.type;

    // Construct real lineage explaining "Proof of Value"
    const response: DrilldownResponse = {
      layer: layer as import('../../shared/drilldown-schema').DrilldownLayer,
      title: `Investigating: ${identifier}`,
      lineage: {
        description: `Direct database trace for ${sourceEntity} at layer ${layer}.`,
        authorId: 'system_aggregation_engine',
        lastUpdated: new Date().toISOString(),
      },
      data: {},
      availableActions: ['export_csv', 'view_source_document']
    };

    // LAYER 1: Financial Summaries -> Breakdown by Category
    if (sourceEntity === 'data_sync_proposal') {
      const [proposal] = await db.select({
         id: schema.dataSyncProposals.id,
         proposedData: schema.dataSyncProposals.proposedData,
         rationale: schema.dataSyncProposals.rationale,
         sourceLineage: schema.dataSyncProposals.sourceLineage,
         confidenceScore: schema.dataSyncProposals.confidenceScore,
         downstreamEffects: schema.dataSyncProposals.downstreamEffects,
         documentId: schema.dataSyncProposals.documentId
      }).from(schema.dataSyncProposals).where(and(eq(schema.dataSyncProposals.id, identifier), eq(schema.dataSyncProposals.userId, (req as any).user.id)));
      
      if (proposal) {
         response.lineage.sqlExtract = `SELECT * FROM data_sync_proposals WHERE id = ?`;
         response.data.summary = { Rationale: proposal.rationale, Confidence: `${Math.round(proposal.confidenceScore * 100)}%`, Target: proposal.downstreamEffects };
         response.data.detail = proposal.proposedData;
         if (proposal.sourceLineage) {
             response.data.rawMetadata = proposal.sourceLineage;
         }
         response.data.evidence = [{
            status: 'Pending Verification',
            document_id: proposal.documentId,
            _nextDrilldown: { layer: 5, sourceEntity: 'document', identifier: proposal.documentId }
         }];
      }
    }
    else if (sourceEntity === 'financial_summary' || (sourceEntity === 'kpi_metric' && identifier.includes('financial'))) {
      const txs = await db.select({
        category: schema.transactions.category,
        total: sql<number>`SUM(amount)`
      }).from(schema.transactions)
        .where(eq(schema.transactions.userId, (req as any).user.id))
        .groupBy(schema.transactions.category);

      response.lineage.sqlExtract = `SELECT category, sum(amount) FROM transactions WHERE user_id = ? GROUP BY category`;
      response.lineage.contributingRecordCount = txs.length;
      response.data.segments = txs.map((t: any) => ({
        name: t.category || 'Uncategorized',
        amount: Number(t.total) || 0,
        _nextDrilldown: { layer: 3, sourceEntity: 'financial_category', identifier: t.category }
      }));
    }
    // LAYER 1: Violation KPI Metrics
    else if (sourceEntity === 'kpi_metric' && identifier.includes('violation')) {
      let statusFilter: string | null = null;
      if (identifier === 'pending_violations') statusFilter = 'pending';
      if (identifier === 'reviewed_violations') statusFilter = 'reviewed';
      if (identifier === 'approved_violations') statusFilter = 'approved';

      let query = db.select().from(schema.violations).where(eq(schema.violations.userId, (req as any).user.id));
      if (statusFilter) {
         query = db.select().from(schema.violations).where(and(eq(schema.violations.userId, (req as any).user.id), eq(schema.violations.status, statusFilter)));
      }
      const records = await query;
      
      response.lineage.sqlExtract = `SELECT * FROM violations WHERE user_id = ? ${statusFilter ? `AND status = '${statusFilter}'` : ''}`;
      response.lineage.contributingRecordCount = records.length;
      response.data.records = records.map((r: any) => ({
        id: r.id,
        date: r.timestamp,
        description: r.description,
        amount: r.type,
        _nextDrilldown: { layer: 4, sourceEntity: 'financial_record', identifier: r.id, context: { filters: { type: 'violation' } } }
      }));
    }
    // LAYER 1: Document KPI Metrics
    else if (sourceEntity === 'kpi_metric' && identifier.includes('document')) {
      const docs = await db.select().from(schema.documents).where(eq(schema.documents.userId, (req as any).user.id));
      response.lineage.sqlExtract = `SELECT * FROM documents WHERE user_id = ?`;
      response.lineage.contributingRecordCount = docs.length;
      response.data.records = docs.map((d: any) => ({
        id: d.id,
        date: d.createdAt,
        description: d.fileName,
        amount: d.category,
        _nextDrilldown: { layer: 5, sourceEntity: 'document', identifier: d.id }
      }));
    }
    // LAYER 1: Communication KPI Metrics
    else if (sourceEntity === 'kpi_metric' && identifier.includes('report_')) {
      const reportId = identifier.split('_').pop() || '';
      const [report] = await db.select().from(schema.sentimentReports).where(eq(schema.sentimentReports.id, reportId));
      if (report) {
         response.lineage.sqlExtract = `SELECT * FROM sentiment_reports WHERE id = ?`;
         response.data.detail = report;
         response.data.evidence = [{ note: "Linked to analyzed communication threads." }];
      }
    }
    // LAYER 3/2: Category -> Individual Transactions
    else if (sourceEntity === 'financial_category') {
      const rows = await db.select().from(schema.transactions)
        .where(and(
          eq(schema.transactions.userId, (req as any).user.id),
          eq(schema.transactions.category, identifier)
        )).limit(500);

      response.lineage.sqlExtract = `SELECT * FROM transactions WHERE category = '${identifier}'`;
      response.lineage.contributingRecordCount = rows.length;
      response.data.records = rows.map((r: any) => ({
        id: r.id,
        date: r.date,
        description: r.description,
        amount: Number(r.amount),
        _nextDrilldown: { layer: 4, sourceEntity: 'financial_record', identifier: r.id.toString() }
      }));
    }
    // LAYER 4: Transaction -> Source Document / Evidence Link
    else if (sourceEntity === 'financial_record') {
      let tx: any = null;

      if (type === 'income') {
        [tx] = await db.select().from(schema.incomes).where(eq(schema.incomes.id, identifier));
      } else if (type === 'expense') {
        [tx] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, identifier));
      } else if (type === 'asset') {
        [tx] = await db.select().from(schema.assets).where(eq(schema.assets.id, identifier));
      } else if (type === 'debt') {
        [tx] = await db.select().from(schema.debts).where(eq(schema.debts.id, identifier));
      } else if (type === 'violation') {
        [tx] = await db.select().from(schema.violations).where(eq(schema.violations.id, identifier));
      } else {
        [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, identifier));
      }

      if (tx) {
        response.data.detail = tx;
        if (tx.documentId) {
          const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, tx.documentId));
          if (doc) {
            response.data.evidence = [doc];
            response.data.detail._nextDrilldown = { layer: 5, sourceEntity: 'document', identifier: doc.id.toString() };
          }
        } else {
          response.data.evidence = [{ note: "No source document mapped. Hand entered." }];
        }
      }
    }
    // LAYER 5: Document Detail -> Violations / Full Audit Trail
    else if (sourceEntity === 'document') {
      const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, identifier));
      if (doc) {
        response.data.rawMetadata = doc;
        response.lineage.description = "Providing original artifact metadata for direct evidentiary review.";
        response.data.detail = { fileUrl: doc.fileUrl, originalCategory: doc.category, description: doc.description };
      }
    }
    // EXTENDED UI DRILLDOWNS
    else if (sourceEntity === 'workflow_state') {
      const state = identifier === 'completed' ? 'resolved' : identifier;
      const vios = await db.select().from(schema.violations)
        .where(and(eq(schema.violations.userId, (req as any).user.id), eq(schema.violations.status, state)));
      response.data.records = vios.map((v: any) => ({
        id: v.id,
        type: v.type,
        description: v.description,
        status: v.status,
        _nextDrilldown: { layer: 4, sourceEntity: 'violation', identifier: v.id }
      }));
      response.lineage.sqlExtract = `SELECT * FROM violations WHERE status = ?`;
      response.lineage.contributingRecordCount = response.data.records.length;
    }
    else if (sourceEntity === 'chart_segment' || sourceEntity === 'audit_log') {
      const txs = await db.select().from(schema.transactions)
        .where(eq(schema.transactions.userId, (req as any).user.id)).limit(100);
      response.data.records = txs.map((t: any) => ({
        id: t.id,
        category: t.category,
        amount: Number(t.amount) || 0,
        date: t.date,
        _nextDrilldown: { layer: 4, sourceEntity: 'financial_record', identifier: t.id }
      }));
      response.lineage.sqlExtract = `SELECT TOP(100) * FROM records`;
      response.lineage.contributingRecordCount = txs.length;
    }
    else if (sourceEntity === 'violation') {
      const [vio] = await db.select().from(schema.violations).where(eq(schema.violations.id, identifier));
      if (vio) {
        response.data.rawMetadata = vio;
        response.lineage.description = "Direct access to violation detail record.";
        response.data.detail = { type: vio.type, description: vio.description, timestamp: vio.timestamp };
      }
    }
    // FALLBACK
    else {
      response.data.summary = { status: 'Unsupported drilldown mapping yet', entity: sourceEntity, id: identifier };
    }

    res.json(response);
  } catch (error) {
    console.error('[Lineage API Error]', error);
    res.status(500).json({ message: 'Failed to resolve entity lineage' });
  }
});

// Phase 6: Human-in-the-loop Review Queue API
lineageRouter.get('/proposals', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const proposals = await db.select({
      id: schema.dataSyncProposals.id,
      documentId: schema.dataSyncProposals.documentId,
      targetTable: schema.dataSyncProposals.targetTable,
      proposedData: schema.dataSyncProposals.proposedData,
      confidenceScore: schema.dataSyncProposals.confidenceScore,
      rationale: schema.dataSyncProposals.rationale,
      sourceLineage: schema.dataSyncProposals.sourceLineage,
      downstreamEffects: schema.dataSyncProposals.downstreamEffects,
      status: schema.dataSyncProposals.status,
      createdAt: schema.dataSyncProposals.createdAt,
      // Join to get the document preview URLs
      document: {
        fileName: schema.documents.fileName,
        fileUrl: schema.documents.fileUrl,
        mimeType: schema.documents.fileType
      }
    })
    .from(schema.dataSyncProposals)
    .leftJoin(schema.documents, eq(schema.dataSyncProposals.documentId, schema.documents.id))
    .where(and(
      eq(schema.dataSyncProposals.userId, userId),
      eq(schema.dataSyncProposals.status, 'pending_review')
    ))
    .orderBy(desc(schema.dataSyncProposals.createdAt));

    res.json(proposals);
  } catch (error) {
    console.error('[Proposals API Error]', error);
    res.status(500).json({ error: 'Failed to fetch review queue' });
  }
});

lineageRouter.post('/proposals/:id/resolve', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { action, editedData } = req.body; 
    // action: 'approve' | 'reject' | 'defer' | 'edit_and_approve'

    const [proposal] = await db.select().from(schema.dataSyncProposals)
      .where(and(
        eq(schema.dataSyncProposals.id, req.params.id),
        eq(schema.dataSyncProposals.userId, userId)
      ));

    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

    let finalStatus = 'pending_review';
    let payload = proposal.proposedData;

    if (action === 'approve') finalStatus = 'approved';
    else if (action === 'reject') finalStatus = 'rejected';
    else if (action === 'defer') finalStatus = 'deferred';
    else if (action === 'edit_and_approve' && editedData) {
      finalStatus = 'approved';
      payload = editedData;
    }

    const [updated] = await db.update(schema.dataSyncProposals)
      .set({ 
        status: finalStatus, 
        proposedData: payload,
        resolvedAt: new Date() 
      })
      .where(eq(schema.dataSyncProposals.id, proposal.id))
      .returning();

    // If dynamically approved, fire the explicit canonical SQL pipeline
    if (finalStatus === 'approved') {
      const { syncCoordinator } = await import('../services/ai/workflow/SyncCoordinator');
      await syncCoordinator.executeApprovedProposal(proposal.id);
    }

    res.json(updated);
  } catch (error) {
    console.error('[Proposal Resolution Error]', error);
    res.status(500).json({ error: 'Failed to resolve proposal' });
  }
});
