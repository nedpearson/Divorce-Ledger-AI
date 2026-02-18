import { SUBSCRIPTION_TIERS, SubscriptionTier, User } from "./schema";

export type TierLimits = typeof SUBSCRIPTION_TIERS[SubscriptionTier];

export function getTierLimits(tier: string): TierLimits {
  const validTier = tier as SubscriptionTier;
  return SUBSCRIPTION_TIERS[validTier] || SUBSCRIPTION_TIERS.free;
}

export function getUserTier(user: User): string {
  return user.subscriptionTier || 'free';
}

export function canCreateCase(user: User): { allowed: boolean; reason?: string } {
  const limits = getTierLimits(getUserTier(user));
  if (limits.maxCases === -1) {
    return { allowed: true };
  }
  if (user.casesCount >= limits.maxCases) {
    return {
      allowed: false,
      reason: `Your ${limits.name} plan allows ${limits.maxCases} case${limits.maxCases === 1 ? '' : 's'}. Upgrade to Pro or higher for unlimited cases.`,
    };
  }
  return { allowed: true };
}

export function canAddViolation(user: User, currentCountOverride?: number): { allowed: boolean; reason?: string } {
  const limits = getTierLimits(getUserTier(user));
  const currentCount = currentCountOverride !== undefined ? currentCountOverride : user.violationsCountThisMonth;
  if (limits.maxViolationsPerMonth === -1) {
    return { allowed: true };
  }
  if (currentCount >= limits.maxViolationsPerMonth) {
    return {
      allowed: false,
      reason: `You've reached your monthly limit of ${limits.maxViolationsPerMonth} violations. Upgrade to Individual or higher for more violations.`,
    };
  }
  return { allowed: true };
}

export function canGenerateCleanPDF(user: User): boolean {
  const limits = getTierLimits(getUserTier(user));
  return !limits.pdfWatermark;
}

export function canAddTeamMember(user: User, currentTeamSize: number): { allowed: boolean; reason?: string } {
  const limits = getTierLimits(getUserTier(user));
  if (limits.maxTeamMembers === 1) {
    return {
      allowed: false,
      reason: `Team members are only available on Team and Enterprise plans. Upgrade to add collaborators.`,
    };
  }
  if (limits.maxTeamMembers === -1) {
    return { allowed: true };
  }
  if (currentTeamSize >= limits.maxTeamMembers) {
    return {
      allowed: false,
      reason: `Your ${limits.name} plan allows ${limits.maxTeamMembers} team members. Upgrade to Enterprise for unlimited team members.`,
    };
  }
  return { allowed: true };
}

export function canUseAIPatternDetection(user: User): boolean {
  const limits = getTierLimits(getUserTier(user));
  return limits.aiPatternDetection;
}

export function canUseHiddenAssetDetection(user: User): boolean {
  const limits = getTierLimits(getUserTier(user));
  return limits.hiddenAssetDetection;
}

export function canUseAPI(user: User): boolean {
  const limits = getTierLimits(getUserTier(user));
  return limits.apiAccess;
}

export function canUseCustomTemplates(user: User): boolean {
  const limits = getTierLimits(getUserTier(user));
  return limits.customTemplates;
}

export function getUpgradeRecommendation(user: User, feature: string): string {
  const currentTier = getUserTier(user) as SubscriptionTier;
  const tierOrder: SubscriptionTier[] = ['free', 'individual', 'pro', 'team', 'enterprise'];
  const currentIndex = tierOrder.indexOf(currentTier);
  
  const featureToTier: Record<string, SubscriptionTier> = {
    'unlimited_violations': 'individual',
    'unlimited_cases': 'pro',
    'ai_pattern_detection': 'pro',
    'team_members': 'team',
    'hidden_asset_detection': 'enterprise',
    'api_access': 'enterprise',
    'custom_templates': 'enterprise',
  };
  
  const requiredTier = featureToTier[feature] || 'pro';
  const requiredIndex = tierOrder.indexOf(requiredTier);
  
  if (currentIndex >= requiredIndex) {
    return '';
  }
  
  const tierInfo = SUBSCRIPTION_TIERS[requiredTier];
  return `Upgrade to ${tierInfo.name} ($${tierInfo.price}/mo) to unlock this feature.`;
}

export function getRemainingViolations(user: User): number | null {
  const limits = getTierLimits(getUserTier(user));
  if (limits.maxViolationsPerMonth === -1) {
    return null; // unlimited
  }
  return Math.max(0, limits.maxViolationsPerMonth - user.violationsCountThisMonth);
}

export function getRemainingCases(user: User): number | null {
  const limits = getTierLimits(getUserTier(user));
  if (limits.maxCases === -1) {
    return null; // unlimited
  }
  return Math.max(0, limits.maxCases - user.casesCount);
}

// Voice & Media limit functions
export function canUseVoiceTranscription(user: User): { allowed: boolean; reason?: string } {
  const limits = getTierLimits(getUserTier(user));
  if (limits.maxVoiceTranscriptionsPerMonth === -1) {
    return { allowed: true };
  }
  if ((user.voiceTranscriptionsThisMonth || 0) >= limits.maxVoiceTranscriptionsPerMonth) {
    return {
      allowed: false,
      reason: `You've reached your monthly limit of ${limits.maxVoiceTranscriptionsPerMonth} voice transcriptions. Upgrade to Pro for unlimited voice input.`,
    };
  }
  return { allowed: true };
}

export function canUploadMedia(user: User): { allowed: boolean; reason?: string } {
  const limits = getTierLimits(getUserTier(user));
  if (limits.maxMediaUploadsPerMonth === -1) {
    return { allowed: true };
  }
  if ((user.mediaUploadsThisMonth || 0) >= limits.maxMediaUploadsPerMonth) {
    return {
      allowed: false,
      reason: `You've reached your monthly limit of ${limits.maxMediaUploadsPerMonth} media uploads. Upgrade to Pro for unlimited uploads.`,
    };
  }
  return { allowed: true };
}

export function getMaxVideoLength(user: User): number {
  const limits = getTierLimits(getUserTier(user));
  return limits.maxVideoLengthSeconds;
}

export function canUseAIClassification(user: User): { allowed: boolean; level: string } {
  const limits = getTierLimits(getUserTier(user));
  return {
    allowed: limits.aiClassification !== 'manual',
    level: limits.aiClassification,
  };
}

export function canUseScreenshotOCR(user: User): boolean {
  const limits = getTierLimits(getUserTier(user));
  return limits.screenshotOCR;
}

export function getRemainingVoiceTranscriptions(user: User): number | "unlimited" {
  const limits = getTierLimits(getUserTier(user));
  if (limits.maxVoiceTranscriptionsPerMonth === -1) {
    return "unlimited";
  }
  return Math.max(0, limits.maxVoiceTranscriptionsPerMonth - (user.voiceTranscriptionsThisMonth || 0));
}

export function getRemainingMediaUploads(user: User): number | "unlimited" {
  const limits = getTierLimits(getUserTier(user));
  if (limits.maxMediaUploadsPerMonth === -1) {
    return "unlimited";
  }
  return Math.max(0, limits.maxMediaUploadsPerMonth - (user.mediaUploadsThisMonth || 0));
}

export function shouldWatermarkMedia(user: User): boolean {
  const limits = getTierLimits(getUserTier(user));
  return limits.pdfWatermark;
}

export function getMaxFileSizeMB(user: User): number {
  const limits = getTierLimits(getUserTier(user));
  return limits.maxFileSizeMB;
}

export function getMaxStorageMB(user: User): number | "unlimited" {
  const limits = getTierLimits(getUserTier(user));
  if (limits.maxStorageMB === -1) {
    return "unlimited";
  }
  return limits.maxStorageMB;
}

export function getRecommendedTierByViolations(violationsThisMonth: number): string {
  if (violationsThisMonth <= 10) return 'free';
  if (violationsThisMonth <= 20) return 'individual';
  if (violationsThisMonth <= 50) return 'pro';
  return 'enterprise';
}
