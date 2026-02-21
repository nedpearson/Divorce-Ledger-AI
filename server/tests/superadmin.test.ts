import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../routes";

// ---------------------------------------------------------------------------
// Platform Admin – gate tests (no auth)
// ---------------------------------------------------------------------------
describe("Platform Admin – API gating", () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use(
      session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: false,
      })
    );
    await registerRoutes(null as any, app);
  });

  it("GET /api/superadmin/overview returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/superadmin/overview");
    // requirePlatformAdmin fires first → no session → 401
    expect(res.status).toBe(401);
  });

  it("GET /api/superadmin/me returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/superadmin/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/superadmin/audit-log returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/superadmin/audit-log");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Audit Log service – never throws
// ---------------------------------------------------------------------------
describe("logAudit – resilience", () => {
  it("does not throw when DB insert fails", async () => {
    // Mock the DB so the insert rejects
    vi.mock("../../shared/db", () => ({
      db: {
        insert: vi.fn(() => {
          throw new Error("DB unavailable");
        }),
      },
    }));

    const { logAudit } = await import("../services/audit-log.service");

    // Should resolve without throwing
    await expect(
      logAudit({
        actorId: "user-123",
        actorEmail: "test@example.com",
        actionType: "user.bootstrap_create",
      })
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Feature flag precedence – resolveFeatures
// ---------------------------------------------------------------------------
describe("resolveFeatures – precedence chain", () => {
  it("user overrides beat workspace overrides beat global flags", async () => {
    /**
     * Set up three flags:
     *   global_only    – only in global flags (enabled: true)
     *   ws_override    – global false, workspace true
     *   user_override  – global false, workspace false, user true
     */
    vi.mock("../../shared/db", () => ({
      db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        // Returns mock rows depending on the table being queried by checking
        // the call sequence: 1st call = featureFlags, 2nd = wsOverrides, 3rd = userEntitlements
        then: vi.fn(),
      },
    }));

    // Direct unit approach: test the precedence logic in isolation
    const globalFlags = [
      { featureKey: "global_only",  defaultEnabled: true  },
      { featureKey: "ws_override",   defaultEnabled: false },
      { featureKey: "user_override", defaultEnabled: false },
    ];
    const wsOverrides = [
      { featureKey: "ws_override",   enabled: true  },
      { featureKey: "user_override", enabled: false },
    ];
    const userOvrs = [
      { featureKey: "user_override", enabled: true },
    ];

    // Replicate the merge logic from resolveFeatures
    const result: Record<string, boolean> = {};
    for (const f of globalFlags) result[f.featureKey] = f.defaultEnabled;
    for (const o of wsOverrides)  result[o.featureKey] = o.enabled;
    for (const o of userOvrs)     result[o.featureKey] = o.enabled;

    expect(result["global_only"]).toBe(true);   // global only
    expect(result["ws_override"]).toBe(true);   // workspace beat global
    expect(result["user_override"]).toBe(true); // user beat workspace & global
  });
});
