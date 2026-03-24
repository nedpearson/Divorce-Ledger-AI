import { openAIReasoningProvider } from './OpenAIReasoningProvider';
import { createLogger } from '../../../lib/logger';
import { fileStorageService } from '../../storage/fileStorageService';

const logger = createLogger('VisionReasoningProvider');

/**
 * VisionReasoningProvider
 * 
 * Invoked when documents are purely visual (blurry phone photos, screenshots, 
 * physical property damage pictures) bypassing Azure Document Intelligence 
 * entirely and feeding base64 directly into GPT-4o-Vision.
 */
export class VisionReasoningProvider {
  async processVisualEvidence(storageFileId: string, mimeType: string): Promise<string> {
    logger.info(`Routing pure visual evidence to MultiModal GPT-4o: ${storageFileId}`);
    
    // 1. Get raw bytes
    const buffer = await fileStorageService.getFileBuffer(storageFileId);
    
    // 2. Convert to base64 Data URI
    const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;

    // 3. Execute Multi-Modal extraction strictly guided by Phase 7 rules
    const systemPrompt = `You are a forensic Scene and Evidence classification engine.
Analyze the provided phone photo, screenshot, handwritten note, or visual evidence.
Classify what the image likely represents (people, injuries, bruises, vehicles, rooms, surroundings, damage, handwriting).
Create structured observations about it.
Propose correct placement in the app by emitting a precise string block summarizing your findings comprehensively, mimicking text extraction so the downstream orchestration pipeline can treat it identically to a Document.`;

    const schema = {
      name: "vision_observation",
      strict: true,
      schema: {
        type: "object",
        properties: {
          classification: { type: "string" },
          observations: { type: "array", items: { type: "string" } },
          proposedFeaturePlacement: { type: "string" },
          synthesizedTextDescription: { type: "string" }
        },
        required: ["classification", "observations", "proposedFeaturePlacement", "synthesizedTextDescription"],
        additionalProperties: false
      }
    };

    const visionResult = await openAIReasoningProvider.runVisionReasoning<{
      classification: string;
      observations: string[];
      proposedFeaturePlacement: string;
      synthesizedTextDescription: string;
    }>(systemPrompt, dataUri, schema);

    // 4. Return the synthesis stringified so downstream FieldMappingProvider categorizes it naturally.
    return JSON.stringify(visionResult, null, 2);
  }
}

export const visionReasoningProvider = new VisionReasoningProvider();
