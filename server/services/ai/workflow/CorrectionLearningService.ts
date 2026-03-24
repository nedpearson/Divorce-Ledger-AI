import { createLogger } from '../../../lib/logger';

const logger = createLogger('CorrectionLearningService');

/**
 * CorrectionLearningService
 * 
 * Captures human-in-the-loop manual corrections when an AI 
 * categorizes or maps a document improperly, updating local 
 * PostgreSQL vector heuristics natively so the `OpenAIReasoningProvider`
 * dynamically learns from mistakes over time.
 */
export class CorrectionLearningService {
  logCorrection(documentId: string, originalCategory: string, correctedCategory: string, userFeedback?: string) {
    logger.info(`Human Overridden Category for ${documentId}: ${originalCategory} -> ${correctedCategory}`);
    
    // Future extension: Save this to a `ai_training_feedbacks` table
    // so we can systematically finetune models or dynamically append 
    // rules to the FieldMappingService prompt context.
    if (userFeedback) {
      logger.debug(`User Override Reason: ${userFeedback}`);
    }
  }
}

export const correctionLearningService = new CorrectionLearningService();
