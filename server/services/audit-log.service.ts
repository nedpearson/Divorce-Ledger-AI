/**
 * server/services/audit-log.service.ts
 *
 * All privileged admin actions are written to audit_log.
 * This is the single place to insert audit records.
 */
import { db } from "../db";
import { auditLog } from "@shared/platform-admin-schema";
import type { InsertAuditLogEntry } from "@shared/platform-admin-schema";
import { Request } from "express";

export type AuditActionType =
  // Workspace/Firm actions
  | "firm.approve"
  | "firm.reject"
  | "firm.suspend"
  | "firm.unsuspend"
  | "firm.plan_assign"
  | "firm.entitlement_override"
  | "firm.feature_override"
  // User actions
  | "user.bootstrap_create"
  | "user.bootstrap_update"
  | "user.password_reset"
  | "user.invite_resend"
  | "user.force_signout"
  | "user.role_adjust"
  | "user.feature_override"
  | "user.suspend"
  | "user.unsuspend"
  // Feature flags
  | "feature.global_toggle"
  | "feature.workspace_toggle"
  | "feature.user_toggle"
  // Plan management
  | "plan.create"
  | "plan.update"
  | "plan.deactivate"
  // Billing
  | "billing.grace_period"
  // Admin access
  | "admin.allowlist_add"
  | "admin.allowlist_remove";

export interface LogAuditParams {
  actorId: string;
  actorEmail: string;
  actionType: AuditActionType;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId:    params.actorId,
      actorEmail: params.actorEmail,
      actionType: params.actionType,
      targetType: params.targetType,
      targetId:   params.targetId,
      details:    params.details ?? {},
      ipAddress:  params.ipAddress,
    } as InsertAuditLogEntry);
  } catch (err) {
    // Never let audit failures crash the actual operation
    console.error("[audit_log] Failed to write audit entry:", err);
  }
}

/**
 * Helper to extract IP from Express request (respects trust proxy)
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}
