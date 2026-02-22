import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../routes";

describe("API Endpoints", () => {
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
    // Add CSRF middleware for test coverage
    const csurf = require('csurf');
    app.use(csurf({ cookie: false }));
    await registerRoutes(null as any, app);
  });

  describe("Health Check", () => {
    it("should return 200 OK for /health", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("should return 200 OK for /api/health", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });
  });

  describe("Auth Session", () => {
    it("should return 401 for /api/auth/session when not logged in", async () => {
      const res = await request(app).get("/api/auth/session");
      expect(res.status).toBe(401);
    });
  });

  describe("Subscription", () => {
    it("should return subscription info (Public access confirmed)", async () => {
      const res = await request(app).get("/api/subscription");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("tier");
    });
  });
});
