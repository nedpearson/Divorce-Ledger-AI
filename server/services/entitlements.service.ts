import { db } from '../db';
import { workspaces, workspaceMembers, matters, subscriptionEntitlements } from '@shared/workspace-schema';
import { documents } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { WORKSPACE_TIER_ENTITLEMENTS, type WorkspaceEntitlements, type WorkspaceTier } from '@shared/workspace-schema';
import {
  featureFlags,
  workspaceFeatureOverrides,
  userEntitlements,
} from '@shared/platform-admin-schema';

/**
 * Resolves effective feature flags for a workspace (and optionally a user).
 * Precedence: global default < workspace override < per-user override
 */
export async function resolveFeatures(
  workspaceId: string,
  userId?: string
): Promise<Record<string, boolean>> {
  const [globals, wsOverrides, userOvrs] = await Promise.all([
    db.select().from(featureFlags),
    db.select().from(workspaceFeatureOverrides).where(eq(workspaceFeatureOverrides.workspaceId, workspaceId)),
    userId
      ? db.select().from(userEntitlements).where(
        and(eq(userEntitlements.userId, userId), eq(userEntitlements.workspaceId, workspaceId))
      )
      : Promise.resolve([]),
  ]);

  const effective: Record<string, boolean> = {};
  for (const f of globals) { effective[f.key] = f.enabled; }
  for (const o of wsOverrides) { effective[o.featureKey] = o.enabled; }
  for (const u of userOvrs) { if (u.enabled !== null && u.enabled !== undefined) effective[u.featureKey] = u.enabled; }
  return effective;
}

/**
 * Resolves current entitlements for a workspace, combining tier limits with overrides
 */
export async function resolveEntitlements(
  workspaceId: string
): Promise<WorkspaceEntitlements> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  // Get base entitlements from tier
  const tierConfig = WORKSPACE_TIER_ENTITLEMENTS[workspace.subscriptionTier];

  if (!tierConfig) {
    throw new Error(`Invalid subscription tier: ${workspace.subscriptionTier}`);
  }

  // Get current usage counts
  const [memberCount, matterCount, storageUsed] = await Promise.all([
    getCurrentSeatsCount(workspaceId),
    getCurrentMattersCount(workspaceId),
    getCurrentStorageUsage(workspaceId),
  ]);

  // Get any entitlement overrides
  const overrides = await db.query.subscriptionEntitlements.findMany({
    where: eq(subscriptionEntitlements.workspaceId, workspaceId),
  });

  const overrideMap = overrides.reduce((acc, ent) => {
    acc[ent.entitlementType] = ent.limitValue;
    return acc;
  }, {} as Record<string, number | null>);

  return {
    matters: {
      limit: overrideMap.matters_limit ?? tierConfig.mattersLimit,
      current: matterCount,
    },
    seats: {
      limit: overrideMap.seats_limit ?? tierConfig.seatsLimit,
      current: memberCount,
    },
    storage: {
      limit: overrideMap.storage_limit ?? tierConfig.storageMB,
      current: storageUsed,
    },
    aiCredits: {
      limit: workspace.aiCreditsLimit,
      current: workspace.aiCreditsBalance,
    },
    // Merge tier features with live feature-flag overrides
    features: {
      ...tierConfig.features,
      ...(await resolveFeatures(workspaceId)),
    } as any,
  };
}

/**
 * Check if a workspace can perform a specific action based on entitlements
 */
export function canPerformAction(
  entitlements: WorkspaceEntitlements,
  action: 'create_matter' | 'add_seat' | 'consume_ai_credits' | 'upload_file'
): { allowed: boolean; reason?: string } {
  switch (action) {
    case 'create_matter':
      if (entitlements.matters.limit === null) {
        return { allowed: true };
      }
      if (entitlements.matters.current >= entitlements.matters.limit) {
        return {
          allowed: false,
          reason: `Matter limit reached (${entitlements.matters.limit}). Please upgrade your plan.`,
        };
      }
      return { allowed: true };

    case 'add_seat':
      if (entitlements.seats.limit === null) {
        return { allowed: true };
      }
      if (entitlements.seats.current >= entitlements.seats.limit) {
        return {
          allowed: false,
          reason: `Seat limit reached (${entitlements.seats.limit}). Please upgrade your plan.`,
        };
      }
      return { allowed: true };

    case 'consume_ai_credits':
      if (entitlements.aiCredits.current <= 0) {
        return {
          allowed: false,
          reason: 'AI credits exhausted. Please upgrade your plan or wait for monthly reset.',
        };
      }
      return { allowed: true };

    case 'upload_file':
      // Check if storage limit would be exceeded (caller should pass file size)
      if (entitlements.storage.current >= entitlements.storage.limit) {
        return {
          allowed: false,
          reason: `Storage limit reached (${Math.round(
            entitlements.storage.limit / 1024
          )} GB). Please upgrade your plan.`,
        };
      }
      return { allowed: true };

    default:
      return { allowed: false, reason: 'Unknown action' };
  }
}

/**
 * Sync entitlements from Stripe subscription to DB
 */
export async function syncEntitlements(
  workspaceId: string,
  tier: WorkspaceTier
): Promise<void> {
  const tierConfig = WORKSPACE_TIER_ENTITLEMENTS[tier];

  if (!tierConfig) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  // Update workspace tier and AI credits
  await db
    .update(workspaces)
    .set({
      subscriptionTier: tier,
      aiCreditsLimit: tierConfig.aiCreditsMonthly,
      aiCreditsBalance: tierConfig.aiCreditsMonthly, // Grant immediately on upgrade
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  // Upsert entitlements
  const entitlementsToSync = [
    { type: 'matters_limit', value: tierConfig.mattersLimit },
    { type: 'seats_limit', value: tierConfig.seatsLimit },
    { type: 'storage_limit', value: tierConfig.storageMB },
  ];

  for (const ent of entitlementsToSync) {
    await db
      .insert(subscriptionEntitlements)
      .values({
        workspaceId,
        entitlementType: ent.type,
        limitValue: ent.value,
        currentUsage: 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [subscriptionEntitlements.workspaceId, subscriptionEntitlements.entitlementType],
        set: {
          limitValue: ent.value,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`Synced entitlements for workspace ${workspaceId} to tier ${tier}`);
}

/**
 * Helper: Get current seat count
 */
async function getCurrentSeatsCount(workspaceId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return result[0]?.count || 0;
}

/**
 * Helper: Get current matter count (non-archived)
 */
async function getCurrentMattersCount(workspaceId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matters)
    .where(
      and(
        eq(matters.workspaceId, workspaceId),
        sql`${matters.status} != 'archived'`
      )
    );

  return result[0]?.count || 0;
}

/**
 * Helper: Get current storage usage in MB
 */
async function getCurrentStorageUsage(workspaceId: string): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${documents.fileSize}), 0) / 1048576.0` })
    .from(documents)
    .where(sql`${documents.userId} IN (SELECT user_id FROM workspace_members WHERE workspace_id = ${workspaceId})`);

  return Math.round(result[0]?.total || 0);
}

/**
 * Check if user has required workspace role
 */
export async function hasWorkspaceRole(
  userId: string,
  workspaceId: string,
  allowedRoles: string[]
): Promise<boolean> {
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId)
    ),
  });

  if (!member) {
    return false;
  }

  return allowedRoles.includes(member.role);
}

/**
 * Check if user can access a matter
 */
export async function hasMatterAccess(
  userId: string,
  matterId: string
): Promise<boolean> {
  // Check if user is a matter member
  const memberCheck = await db.query.matterMembers.findFirst({
    where: and(
      eq(matters.id, matterId),
      sql`EXISTS (
        SELECT 1 FROM matter_members mm
        WHERE mm.matter_id = ${matterId}
        AND mm.user_id = ${userId}
      )`
    ),
  });

  if (memberCheck) {
    return true;
  }

  // Check if user is a workspace member with attorney/admin role
  const matter = await db.query.matters.findFirst({
    where: eq(matters.id, matterId),
  });

  if (!matter) {
    return false;
  }

  return hasWorkspaceRole(userId, matter.workspaceId, ['owner', 'admin', 'staff']);
}

export class EntitlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntitlementError';
  }
}
