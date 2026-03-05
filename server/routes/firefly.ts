import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { FireflyIIIService, getFireflyService, FireflyAPIError } from "../services/firefly-iii.service";
import { encryptToken, decryptToken } from "../lib/encryption";
import { handleRouteError } from "../lib/errorHandler";
import { z } from "zod";

const router = Router();

const ConnectionConfigSchema = z.object({
  instanceUrl: z.string().url("Must be a valid URL"),
  accessToken: z.string().min(10, "Access token is required"),
  autoSyncEnabled: z.boolean().optional().default(false),
});

const DocumentTransactionSchema = z.object({
  documentId: z.string().min(1, "documentId is required"),
  documentUrl: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
  amount: z.number().positive("amount must be a positive number"),
  currencyCode: z.string().length(3, "currencyCode must be 3 characters").default("USD"),
  description: z.string().min(1, "description is required"),
  merchantName: z.string().optional(),
  categoryName: z.string().optional(),
  sourceAccountId: z.string().optional(),
  destinationAccountId: z.string().optional(),
  notes: z.string().optional(),
});

router.get("/status", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";

    const connection = await storage.getFireflyConnection(userId, environment);
    
    if (!connection) {
      return res.json({
        connected: false,
        message: "No Firefly III connection configured",
      });
    }

    const decryptedToken = decryptToken(connection.accessToken);
    const service = new FireflyIIIService({
      baseUrl: connection.instanceUrl,
      accessToken: decryptedToken,
    });

    const testResult = await service.testConnection();

    if (testResult.success) {
      await storage.updateFireflyConnection(connection.id, {
        instanceVersion: testResult.version,
        lastSyncStatus: "connected",
      });
    }

    return res.json({
      connected: testResult.success,
      instanceUrl: connection.instanceUrl,
      instanceVersion: testResult.version,
      autoSyncEnabled: connection.autoSyncEnabled,
      lastSyncAt: connection.lastSyncAt,
      lastSyncStatus: connection.lastSyncStatus,
      error: testResult.error,
    });
  } catch (error: any) {
    console.error("[Firefly] Status check failed:", error);
    handleRouteError(res, error); return;
  }
});

router.post("/connect", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";

    const validation = ConnectionConfigSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid configuration",
        details: validation.error.errors,
      });
    }

    const { instanceUrl, accessToken, autoSyncEnabled } = validation.data;

    const service = new FireflyIIIService({
      baseUrl: instanceUrl,
      accessToken: accessToken,
    });

    const testResult = await service.testConnection();
    if (!testResult.success) {
      return res.status(400).json({
        error: "Failed to connect to Firefly III",
        details: testResult.error,
      });
    }

    const existingConnection = await storage.getFireflyConnection(userId, environment);
    if (existingConnection) {
      await storage.deleteFireflyConnection(existingConnection.id);
    }

    const encryptedToken = encryptToken(accessToken);
    
    const connection = await storage.createFireflyConnection({
      userId,
      environment,
      instanceUrl: instanceUrl.endsWith("/") ? instanceUrl.slice(0, -1) : instanceUrl,
      accessToken: encryptedToken,
      instanceVersion: testResult.version,
      isActive: true,
      autoSyncEnabled: autoSyncEnabled || false,
    });

    console.log(`[Firefly] User ${userId} connected to Firefly III v${testResult.version}`);

    return res.json({
      success: true,
      connectionId: connection.id,
      instanceVersion: testResult.version,
      message: "Successfully connected to Firefly III",
    });
  } catch (error: any) {
    console.error("[Firefly] Connection failed:", error);
    handleRouteError(res, error); return;
  }
});

router.post("/disconnect", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";

    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection) {
      return res.status(404).json({ error: "No active connection found" });
    }

    await storage.deleteFireflyConnection(connection.id);
    console.log(`[Firefly] User ${userId} disconnected from Firefly III`);

    return res.json({
      success: true,
      message: "Disconnected from Firefly III",
    });
  } catch (error: any) {
    console.error("[Firefly] Disconnect failed:", error);
    handleRouteError(res, error); return;
  }
});

router.post("/sync/expense/:expenseId", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";
    const { expenseId } = req.params;

    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection) {
      return res.status(400).json({ error: "Firefly III not connected" });
    }

    const existingSync = await storage.getFireflySyncLogBySourceId("expense", expenseId);

    const expenses = await storage.getExpenses(userId, environment);
    const expense = expenses.find((e) => e.id === expenseId);
    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const decryptedToken = decryptToken(connection.accessToken);
    const service = new FireflyIIIService({
      baseUrl: connection.instanceUrl,
      accessToken: decryptedToken,
    });

    const result = await service.syncExpense({
      id: expense.id,
      documentId: expense.documentId,
      description: expense.description,
      amountCents: expense.amount,
      date: expense.startDate || new Date().toISOString().split("T")[0],
      vendor: expense.vendor,
      category: expense.category,
    });

    if (existingSync) {
      await storage.updateFireflySyncLog(existingSync.id, {
        fireflyTransactionId: result.data.id,
        syncedAt: new Date(),
        status: "success",
      });
    } else {
      await storage.createFireflySyncLog({
        connectionId: connection.id,
        userId,
        environment,
        syncType: "manual",
        sourceType: "expense",
        sourceId: expenseId,
        fireflyTransactionId: result.data.id,
        status: "success",
      });
    }

    await storage.updateFireflyConnection(connection.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: "success",
    });

    return res.json({
      success: true,
      fireflyTransactionId: result.data.id,
      message: "Expense synced to Firefly III",
    });
  } catch (error: any) {
    console.error("[Firefly] Expense sync failed:", error);
    handleRouteError(res, error); return;
  }
});

router.post("/sync/income/:incomeId", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";
    const { incomeId } = req.params;

    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection) {
      return res.status(400).json({ error: "Firefly III not connected" });
    }

    const existingSync = await storage.getFireflySyncLogBySourceId("income", incomeId);

    const incomes = await storage.getIncomes(userId, environment);
    const income = incomes.find((i) => i.id === incomeId);
    if (!income) {
      return res.status(404).json({ error: "Income not found" });
    }

    const decryptedToken = decryptToken(connection.accessToken);
    const service = new FireflyIIIService({
      baseUrl: connection.instanceUrl,
      accessToken: decryptedToken,
    });

    const result = await service.syncIncome({
      id: income.id,
      documentId: income.documentId,
      source: income.source,
      amountCents: income.amount,
      date: income.startDate || new Date().toISOString().split("T")[0],
      description: income.source,
    });

    if (existingSync) {
      await storage.updateFireflySyncLog(existingSync.id, {
        fireflyTransactionId: result.data.id,
        syncedAt: new Date(),
        status: "success",
      });
    } else {
      await storage.createFireflySyncLog({
        connectionId: connection.id,
        userId,
        environment,
        syncType: "manual",
        sourceType: "income",
        sourceId: incomeId,
        fireflyTransactionId: result.data.id,
        status: "success",
      });
    }

    await storage.updateFireflyConnection(connection.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: "success",
    });

    return res.json({
      success: true,
      fireflyTransactionId: result.data.id,
      message: "Income synced to Firefly III",
    });
  } catch (error: any) {
    console.error("[Firefly] Income sync failed:", error);
    handleRouteError(res, error); return;
  }
});

router.post("/sync/all", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";

    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection) {
      return res.status(400).json({ error: "Firefly III not connected" });
    }

    const decryptedToken = decryptToken(connection.accessToken);
    const service = new FireflyIIIService({
      baseUrl: connection.instanceUrl,
      accessToken: decryptedToken,
    });

    const expenses = await storage.getExpenses(userId, environment);
    const incomes = await storage.getIncomes(userId, environment);

    const results = {
      expenses: { synced: 0, skipped: 0, failed: 0 },
      incomes: { synced: 0, skipped: 0, failed: 0 },
    };

    for (const expense of expenses) {
      try {
        const existingSync = await storage.getFireflySyncLogBySourceId("expense", expense.id);
        if (existingSync) {
          results.expenses.skipped++;
          continue;
        }

        const result = await service.syncExpense({
          id: expense.id,
          documentId: expense.documentId,
          description: expense.description,
          amountCents: expense.amount,
          date: expense.startDate || new Date().toISOString().split("T")[0],
          vendor: expense.vendor,
          category: expense.category,
        });

        await storage.createFireflySyncLog({
          connectionId: connection.id,
          userId,
          environment,
          syncType: "bulk",
          sourceType: "expense",
          sourceId: expense.id,
          fireflyTransactionId: result.data.id,
          status: "success",
        });

        results.expenses.synced++;
      } catch (error: any) {
        console.error(`[Firefly] Failed to sync expense ${expense.id}:`, error.message);
        results.expenses.failed++;
      }
    }

    for (const income of incomes) {
      try {
        const existingSync = await storage.getFireflySyncLogBySourceId("income", income.id);
        if (existingSync) {
          results.incomes.skipped++;
          continue;
        }

        const result = await service.syncIncome({
          id: income.id,
          documentId: income.documentId,
          source: income.source,
          amountCents: income.amount,
          date: income.startDate || new Date().toISOString().split("T")[0],
          description: income.source,
        });

        await storage.createFireflySyncLog({
          connectionId: connection.id,
          userId,
          environment,
          syncType: "bulk",
          sourceType: "income",
          sourceId: income.id,
          fireflyTransactionId: result.data.id,
          status: "success",
        });

        results.incomes.synced++;
      } catch (error: any) {
        console.error(`[Firefly] Failed to sync income ${income.id}:`, error.message);
        results.incomes.failed++;
      }
    }

    await storage.updateFireflyConnection(connection.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: results.expenses.failed + results.incomes.failed > 0 ? "partial" : "success",
    });

    return res.json({
      success: true,
      results,
      message: `Synced ${results.expenses.synced} expenses and ${results.incomes.synced} incomes`,
    });
  } catch (error: any) {
    console.error("[Firefly] Bulk sync failed:", error);
    handleRouteError(res, error); return;
  }
});

router.get("/sync-logs", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";

    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection) {
      return res.json({ logs: [] });
    }

    const logs = await storage.getFireflySyncLogs(connection.id, 100);
    return res.json({ logs });
  } catch (error: any) {
    console.error("[Firefly] Failed to fetch sync logs:", error);
    handleRouteError(res, error); return;
  }
});

router.get("/accounts", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";
    const { type } = req.query;

    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection) {
      return res.status(400).json({ error: "Firefly III not connected" });
    }

    const decryptedToken = decryptToken(connection.accessToken);
    const service = new FireflyIIIService({
      baseUrl: connection.instanceUrl,
      accessToken: decryptedToken,
    });

    const accounts = await service.getAccounts(type as string | undefined);
    return res.json({ accounts });
  } catch (error: any) {
    console.error("[Firefly] Failed to fetch accounts:", error);
    if (error instanceof FireflyAPIError) {
      return res.status(error.status).json({ error: error.message, details: error.responseBody });
    }
    handleRouteError(res, error); return;
  }
});

router.post("/transactions/from-document", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";

    const validation = DocumentTransactionSchema.safeParse(req.body);
    if (!validation.success) {
      const missingFields = validation.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
      return res.status(400).json({
        error: "Validation failed",
        details: missingFields,
      });
    }

    const data = validation.data;

    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection) {
      return res.status(400).json({ error: "Firefly III not connected. Please connect to Firefly III first." });
    }

    const decryptedToken = decryptToken(connection.accessToken);
    const service = new FireflyIIIService({
      baseUrl: connection.instanceUrl,
      accessToken: decryptedToken,
    });

    const chainOfCustodyNote = [
      data.notes || "",
      "",
      "--- Chain of Custody ---",
      `Source: Divorce Ledger`,
      `Document ID: ${data.documentId}`,
      data.documentUrl ? `Document URL: ${data.documentUrl}` : "",
      `Imported: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n");

    const transactionPayload: any = {
      type: "withdrawal",
      date: data.date,
      amount: data.amount.toFixed(2),
      description: data.description,
      currency_code: data.currencyCode,
      category_name: data.categoryName,
      notes: chainOfCustodyNote,
      external_id: `divorce-ledger-doc-${data.documentId}`,
      tags: ["divorce-ledger", "document-import"],
    };

    if (data.sourceAccountId) {
      transactionPayload.source_id = data.sourceAccountId;
    }
    
    if (data.destinationAccountId) {
      transactionPayload.destination_id = data.destinationAccountId;
    } else if (data.merchantName) {
      transactionPayload.destination_name = data.merchantName;
    } else {
      transactionPayload.destination_name = "Unknown Merchant";
    }

    const result = await service.createTransaction(transactionPayload);

    await storage.createFireflySyncLog({
      connectionId: connection.id,
      userId,
      environment,
      syncType: "document",
      sourceType: "document",
      sourceId: data.documentId,
      fireflyTransactionId: result.data.id,
      status: "success",
    });

    await storage.updateFireflyConnection(connection.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: "success",
    });

    console.log(`[Firefly] Created transaction from document ${data.documentId}: ${result.data.id}`);

    return res.json({
      success: true,
      transaction: result.data,
      message: "Transaction created successfully in Firefly III",
    });
  } catch (error: any) {
    console.error("[Firefly] Transaction from document failed:", error);
    
    if (error instanceof FireflyAPIError) {
      return res.status(error.status).json({
        error: "Firefly III API error",
        status: error.status,
        details: error.responseBody,
        url: error.url,
      });
    }
    
    handleRouteError(res, error); return;
  }
});

router.get("/categories", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string || "demo-client-user";
    const environment = req.headers["x-environment"] as string || "demo";

    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection) {
      return res.status(400).json({ error: "Firefly III not connected" });
    }

    const decryptedToken = decryptToken(connection.accessToken);
    const service = new FireflyIIIService({
      baseUrl: connection.instanceUrl,
      accessToken: decryptedToken,
    });

    const categories = await service.getCategories();
    return res.json({ categories });
  } catch (error: any) {
    console.error("[Firefly] Failed to fetch categories:", error);
    if (error instanceof FireflyAPIError) {
      return res.status(error.status).json({ error: error.message, details: error.responseBody });
    }
    handleRouteError(res, error); return;
  }
});

export default router;
