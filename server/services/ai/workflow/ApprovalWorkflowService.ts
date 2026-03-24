import { documentRepository } from '../../storage/documentRepository';
import { ConfidenceAssessment } from '../core/ConfidenceScoringService';
import { MappedFieldsResult } from '../core/FieldMappingService';
import { syncCoordinator } from './SyncCoordinator';
import { sourceLineageService } from './SourceLineageService';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('ApprovalWorkflowService');

/**
 * ApprovalWorkflowService
 * 
 * Replaces the monolithic WorkflowService. Acts as the traffic controller 
 * taking the finalized extracted components, persisting them accurately into 
 * the Postgres native `documents` schema, and pushing to the Sync Coordinator
 * if auto-approval thresholds are met.
 */
export class ApprovalWorkflowService {

  async routeDocument(documentId: string, fields: MappedFieldsResult, confidence: ConfidenceAssessment) {
    logger.info(`Routing workflow for ${documentId}. Confidence: ${confidence.score}`);

    // High confidence, low risk -> we automatically sync into child modules natively
    const isAutoApprovable = !confidence.requiresHumanReview;

    sourceLineageService.establishLineage(documentId, fields.extractedFields);

    await documentRepository.updateDocument(documentId, {
      status: isAutoApprovable ? 'finalized' : 'suggested',
      category: isAutoApprovable ? fields.category : undefined,
      suggestedCategory: !isAutoApprovable ? fields.category : undefined,
      aiSummary: fields.summary,
      aiConfidence: confidence.score,
      extractedFields: JSON.stringify(fields.extractedFields),
      errorMessage: fields.flags.length > 0 ? `Flags: ${fields.flags.join(', ')}` : undefined,
      // Pass any negative scoring reasons to explicitly inform the human reviewer
      description: confidence.requiresHumanReview ? `Review Needed: ${confidence.scoringReasons.join(', ')}` : undefined
    });

    // Always propose the sync—SyncCoordinator explicitly delegates human-review vs auto-insert.
    await syncCoordinator.proposeDownstreamSync(documentId, fields, confidence);
  }
}

export const approvalWorkflowService = new ApprovalWorkflowService();
