import { db } from '../db';
import { violations, users, evidenceFiles, cases, type EvidenceFile } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { tierEnforcementService } from '../tier-enforcement';

export interface MediaFile {
  id: string;
  violationId: string;
  fileType: 'audio' | 'video' | 'image';
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  storageUrl: string;
  durationSeconds?: number;
  transcript?: string;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface ViolationMediaData {
  audioTranscript?: string;
  mediaFiles: MediaFile[];
  aiClassification?: string;
  processingMetadata: {
    totalDuration?: number;
    mediaCount: number;
    transcriptionConfidence?: number;
    keyPhrases?: string[];
  };
}

const TIER_FILE_LIMITS = {
  free: 10 * 1024 * 1024, // 10MB
  individual: 50 * 1024 * 1024, // 50MB
  pro: 100 * 1024 * 1024, // 100MB
  team: 250 * 1024 * 1024, // 250MB
  enterprise: 500 * 1024 * 1024, // 500MB
};

export class MediaService {
  getMaxFileSizeForTier(tier: string): number {
    return TIER_FILE_LIMITS[tier as keyof typeof TIER_FILE_LIMITS] || TIER_FILE_LIMITS.free;
  }

  async uploadMedia(
    violationId: string,
    userId: string,
    fileName: string,
    fileType: 'audio' | 'video' | 'image',
    fileSizeBytes: number,
    mimeType: string,
    storageUrl: string,
    durationSeconds?: number,
    environment: string = 'demo'
  ): Promise<any> {
    const fileSizeMB = fileSizeBytes / (1024 * 1024);

    const tierCheck = await tierEnforcementService.canUploadFile(userId, fileSizeMB);

    if (!tierCheck.allowed) {
      console.warn(`Upload blocked: ${tierCheck.reason}`);
      throw new Error(tierCheck.reason || 'Upload not allowed');
    }

    if (tierCheck.warning) {
      console.warn(`Tier Warning: ${tierCheck.warning}`);
    }

    const [evidence] = await db
      .insert(evidenceFiles)
      .values({
        violationId,
        userId,
        fileName,
        fileType,
        fileSize: fileSizeBytes,
        objectPath: `media/${violationId}/${fileName}`,
        environment,
        evidenceSource: 'media_upload',
        evidenceMetadata: {
          mimeType,
          durationSeconds,
          processingStatus: 'pending',
          uploadTimestamp: new Date().toISOString(),
        },
      })
      .returning();

    await tierEnforcementService.logUsageMetrics(userId, environment);

    console.log(`Media uploaded: ${fileName} (${fileType})`);
    return evidence;
  }

  async saveTranscript(violationId: string, transcript: string): Promise<void> {
    await db
      .update(violations)
      .set({
        audioTranscript: transcript,
      })
      .where(eq(violations.id, violationId));

    console.log(`Transcript saved for violation ${violationId}`);
  }

  async classifyViolation(violationId: string): Promise<any> {
    const [violation] = await db.select().from(violations).where(eq(violations.id, violationId));

    if (!violation?.audioTranscript) {
      throw new Error('No transcript available for classification');
    }

    const classification = this.analyzeTranscript(violation.audioTranscript);

    await db
      .update(violations)
      .set({
        aiClassification: classification.type,
        severityScore: classification.severity,
        aiConfidenceScore: classification.confidence,
      })
      .where(eq(violations.id, violationId));

    console.log(
      `Violation classified: ${classification.type} (Severity: ${classification.severity}, Confidence: ${classification.confidence})`
    );
    return classification;
  }

  private analyzeTranscript(transcript: string): any {
    const lowerTranscript = transcript.toLowerCase();

    const patterns: Record<string, { keywords: string[]; threshold: number }> = {
      harassment: {
        keywords: [
          'constant',
          'repeated',
          "won't stop",
          'every day',
          'always',
          "can't handle",
          'fed up',
        ],
        threshold: 0.4,
      },
      control: {
        keywords: ['need to listen', 'have to', 'must', 'i control', "you can't", 'permission'],
        threshold: 0.3,
      },
      threats: {
        keywords: ['going to', "you'll regret", "i'll make you", "you'll see", "i'm warning you"],
        threshold: 0.5,
      },
      verbal_abuse: {
        keywords: ['stupid', 'idiot', 'crazy', 'useless', 'pathetic', 'loser', 'worthless'],
        threshold: 0.3,
      },
      custody_violation: {
        keywords: ['kids', 'children', 'custody', 'visitation', 'pick up', 'drop off', 'schedule'],
        threshold: 0.3,
      },
    };

    const scores: Record<string, number> = {};

    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = pattern.keywords.filter((keyword) => lowerTranscript.includes(keyword));
      const matchRate = matches.length / pattern.keywords.length;

      if (matchRate >= pattern.threshold) {
        scores[type] = matchRate;
      }
    }

    const sortedTypes = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const primaryType = sortedTypes.length > 0 ? sortedTypes[0][0] : 'unclassified';
    const confidenceScore = scores[primaryType] || 0;

    return {
      type: primaryType,
      confidence: Math.round(confidenceScore * 100) / 100,
      detectedPatterns: Object.keys(scores),
      severity: this.calculateSeverity(primaryType, confidenceScore),
      recommendation: confidenceScore > 0.6 ? 'Flag for lawyer review' : 'Monitor for escalation',
    };
  }

  private calculateSeverity(type: string, confidence: number): number {
    const baseSeverity: Record<string, number> = {
      harassment: 60,
      control: 55,
      threats: 85,
      verbal_abuse: 65,
      custody_violation: 70,
      unclassified: 30,
    };

    const base = baseSeverity[type] || 30;
    return Math.round(base * confidence);
  }

  async getMediaForViolation(violationId: string): Promise<ViolationMediaData> {
    const [violation] = await db.select().from(violations).where(eq(violations.id, violationId));

    if (!violation) {
      throw new Error(`Violation ${violationId} not found`);
    }

    const mediaFiles = await db
      .select()
      .from(evidenceFiles)
      .where(
        and(
          eq(evidenceFiles.violationId, violationId),
          eq(evidenceFiles.evidenceSource, 'media_upload')
        )
      );

    let totalDuration = 0;
    const formattedFiles = mediaFiles.map((m: EvidenceFile) => {
      const metadata = (m.evidenceMetadata as Record<string, unknown>) || {};
      const duration = metadata.durationSeconds as number | undefined;
      if (duration) totalDuration += duration;

      return {
        id: m.id,
        violationId: m.violationId,
        fileType: m.fileType as 'audio' | 'video' | 'image',
        fileName: m.fileName,
        fileSizeBytes: m.fileSize || 0,
        mimeType: (metadata.mimeType as string) || '',
        storageUrl: m.objectPath || '',
        durationSeconds: duration,
        transcript: metadata.transcript as string | undefined,
        processingStatus:
          (metadata.processingStatus as MediaFile['processingStatus']) || 'completed',
      };
    });

    return {
      audioTranscript: violation.audioTranscript || undefined,
      mediaFiles: formattedFiles,
      aiClassification: violation.aiClassification || undefined,
      processingMetadata: {
        mediaCount: formattedFiles.length,
        totalDuration: totalDuration || undefined,
        transcriptionConfidence: violation.aiConfidenceScore || undefined,
        keyPhrases: this.extractKeyPhrases(violation.audioTranscript || ''),
      },
    };
  }

  private extractKeyPhrases(transcript: string): string[] {
    if (!transcript) return [];

    const keywords = [
      'permission',
      'children',
      'custody',
      'agreement',
      'frustrated',
      'threatening',
      'abuse',
      'scared',
      'court order',
      'violation',
      'money',
      'hiding',
    ];

    const lowerTranscript = transcript.toLowerCase();
    return keywords.filter((kw) => lowerTranscript.includes(kw));
  }

  async getViolationsThisMonth(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(violations)
      .where(
        and(
          eq(violations.userId, userId),
          sql`DATE_TRUNC('month', ${violations.timestamp}) = DATE_TRUNC('month', NOW())`
        )
      );

    return Number(result[0]?.count || 0);
  }

  async getViolationsThisMonthByCase(caseId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(violations)
      .where(
        and(
          eq(violations.caseId, caseId),
          sql`DATE_TRUNC('month', ${violations.timestamp}) = DATE_TRUNC('month', NOW())`
        )
      );

    return Number(result[0]?.count || 0);
  }

  async updateUserTierMetrics(
    userId: string
  ): Promise<{ totalViolations: number; recommendedTier: string }> {
    const userCases = await db.select().from(cases).where(eq(cases.userId, userId));

    let totalViolations = 0;

    for (const caseRow of userCases) {
      const count = await this.getViolationsThisMonthByCase(caseRow.id);
      totalViolations += count;
    }

    let recommendedTier = 'free';
    if (totalViolations > 50) {
      recommendedTier = 'enterprise';
    } else if (totalViolations > 20) {
      recommendedTier = 'pro';
    } else if (totalViolations > 10) {
      recommendedTier = 'individual';
    }

    await db
      .update(users)
      .set({ violationsCountThisMonth: totalViolations })
      .where(eq(users.id, userId));

    console.log(
      `Updated tier metrics for user ${userId}: ${totalViolations} violations, recommended: ${recommendedTier}`
    );

    return { totalViolations, recommendedTier };
  }
}

export const mediaService = new MediaService();
