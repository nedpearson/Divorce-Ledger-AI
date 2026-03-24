import { DocumentExtractionResult } from '../providers/AzureDocumentIntelligenceProvider';
import { MappedFieldsResult } from './FieldMappingService';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('ConfidenceScoringService');

export interface ConfidenceAssessment {
  score: number;
  requiresHumanReview: boolean;
  scoringReasons: string[];
}

/**
 * ConfidenceScoringService
 * 
 * Runs mathematical heuristics over GPT's output and Microsoft's Azure Form Recognizer 
 * layouts to determine if a document is 100% trustworthy to auto-sync, or requires 
 * human-in-the-loop review queues.
 */
export class ConfidenceScoringService {
  assessConfidence(extraction: DocumentExtractionResult, fields: MappedFieldsResult): ConfidenceAssessment {
    logger.debug('Assigning multi-dimensional confidence score');

    let score = 0.95;
    const reasons: string[] = [];

    if (extraction.isHandwritten) {
      score -= 0.3;
      reasons.push('Handwritten elements detected');
    }

    if (fields.flags.length > 0) {
      score -= (fields.flags.length * 0.1);
      reasons.push(`AI mapped anomaly flags: ${fields.flags.join(', ')}`);
    }

    if (extraction.pages > 50) {
      score -= 0.1;
      reasons.push('Massive document size reduces localized confidence');
    }

    // Floor at 0, Ceil at 1.0
    score = Math.max(0, Math.min(1.0, score));

    return {
      score,
      requiresHumanReview: score < 0.85,
      scoringReasons: reasons
    };
  }
}

export const confidenceScoringService = new ConfidenceScoringService();
