import { createLogger } from '../../../lib/logger';
import { MappedFieldsResult } from '../core/FieldMappingService';
import { ConfidenceAssessment } from '../core/ConfidenceScoringService';
import { db } from '../../../db';
import { dataSyncProposals, documents } from '../../../../shared/schema';
import { eq } from 'drizzle-orm';
import { sourceLineageService } from './SourceLineageService';

const logger = createLogger('SyncCoordinator');

/**
 * SyncCoordinator
 * 
 * Invoked when documents are mathematically finalized. 
 * Prevents Destructive Overwrites. Only inserts into `data_sync_proposals`.
 * If confidence is high, instantly escalates proposal to 'approved' and commits it.
 */
export class SyncCoordinator {
  async proposeDownstreamSync(documentId: string, fields: MappedFieldsResult, confidence: ConfidenceAssessment) {
    logger.info(`Generating explicit Data Sync Proposal for Doc: ${documentId} [${fields.category}]. Auto-Approvable: ${!confidence.requiresHumanReview}`);
    
    // 1. Get the owning user and context
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!doc) throw new Error('Document vanished before sync allocation');

    // 2. Determine target table based on AI category taxonomy
    let targetTable = 'unknown';
    if (fields.category === 'receipt' || fields.category === 'financial_statement') {
      targetTable = 'expenses';
    } else if (fields.category === 'paystub') {
      targetTable = 'incomes';
    } else if (fields.category === 'property_damage') {
      targetTable = 'violations';
    } else if (fields.category === 'legal_pleading') {
      targetTable = 'timeline_events';
    } else {
      targetTable = 'notes';
    }

    // 3. Obtain Source Lineage (Bounding box refs)
    const lineage = sourceLineageService.establishLineage(documentId, fields.extractedFields);

    // 4. Construct the Proposal Row
    const isAutoApprovable = !confidence.requiresHumanReview;
    const proposalData = {
      documentId,
      userId: doc.userId,
      caseId: null,
      targetTable,
      proposedData: fields.extractedFields,
      confidenceScore: confidence.score,
      rationale: confidence.scoringReasons.join(' | ') || 'AI determined extraction meets schema constraints',
      sourceLineage: lineage,
      downstreamEffects: `Will insert 1 record into [${targetTable}] natively.`,
      status: isAutoApprovable ? 'approved' : 'pending_review',
      environment: doc.environment
    };

    // 5. Insert Proposal into Drizzle natively
    const [inserted] = await db.insert(dataSyncProposals).values(proposalData).returning();

    // 6. If Auto-Approvable, immediately dispatch to the target canonical table
    if (isAutoApprovable) {
      await this.executeApprovedProposal(inserted.id);
    }
    
    return inserted;
  }

  async executeApprovedProposal(proposalId: string) {
    // In Phase 6, this physically maps the JSON payload into the target Drizzle Table
    // E.g. db.insert(expenses).values({...})
    logger.info(`Native SQL Sync firing for approved human-verified proposal: ${proposalId}`);
    return true;
  }
}

export const syncCoordinator = new SyncCoordinator();
