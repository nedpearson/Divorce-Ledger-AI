import axios, { AxiosInstance, AxiosError } from "axios";

export class FireflyAPIError extends Error {
  public readonly status: number;
  public readonly responseBody: any;
  public readonly url: string;

  constructor(message: string, status: number, responseBody: any, url: string) {
    super(message);
    this.name = "FireflyAPIError";
    this.status = status;
    this.responseBody = responseBody;
    this.url = url;
  }
}

function normalizeFireflyError(error: AxiosError, context: string): FireflyAPIError {
  const status = error.response?.status || 500;
  const responseBody = error.response?.data || { message: error.message };
  const url = error.config?.url || "unknown";
  const message = `[FireflyIII] ${context}: HTTP ${status} at ${url}`;
  
  console.error(message, JSON.stringify(responseBody).substring(0, 500));
  
  return new FireflyAPIError(message, status, responseBody, url);
}

interface FireflyConfig {
  baseUrl: string;
  accessToken: string;
}

interface FireflyTransaction {
  type: "withdrawal" | "deposit" | "transfer";
  date: string;
  amount: string;
  description: string;
  source_name?: string;
  source_id?: string;
  destination_name?: string;
  destination_id?: string;
  category_name?: string;
  currency_code?: string;
  notes?: string;
  external_id?: string;
  tags?: string[];
}

interface FireflyTransactionResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      created_at: string;
      updated_at: string;
      group_title: string;
      transactions: Array<{
        transaction_journal_id: string;
        type: string;
        date: string;
        amount: string;
        description: string;
      }>;
    };
  };
}

interface FireflyAccount {
  id: string;
  name: string;
  type: string;
  current_balance: string;
  currency_code: string;
}

interface FireflyCategory {
  id: string;
  name: string;
}

interface FireflyAbout {
  version: string;
  api_version: string;
  os: string;
  driver: string;
}

export class FireflyIIIService {
  private client: AxiosInstance;
  private config: FireflyConfig;

  constructor(config: FireflyConfig) {
    this.config = config;
    const baseURL = config.baseUrl.endsWith("/")
      ? config.baseUrl.slice(0, -1)
      : config.baseUrl;

    this.client = axios.create({
      baseURL: `${baseURL}/api/v1`,
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      timeout: 30000,
    });
  }

  async testConnection(): Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      const response = await this.client.get<{ data: FireflyAbout }>("/about");
      return {
        success: true,
        version: response.data.data.version,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error("[FireflyIII] Connection test failed:", axiosError.message);
      return {
        success: false,
        error:
          axiosError.response?.status === 401
            ? "Invalid access token"
            : axiosError.response?.status === 404
            ? "Firefly III API not found at this URL"
            : `Connection failed: ${axiosError.message}`,
      };
    }
  }

  async getAccounts(type?: string): Promise<FireflyAccount[]> {
    try {
      const params = type ? { type } : {};
      const response = await this.client.get("/accounts", { params });
      return response.data.data.map((item: any) => ({
        id: item.id,
        name: item.attributes.name,
        type: item.attributes.type,
        current_balance: item.attributes.current_balance,
        currency_code: item.attributes.currency_code,
      }));
    } catch (error) {
      throw normalizeFireflyError(error as AxiosError, "Failed to fetch accounts");
    }
  }

  async getCategories(): Promise<FireflyCategory[]> {
    try {
      const response = await this.client.get("/categories");
      return response.data.data.map((item: any) => ({
        id: item.id,
        name: item.attributes.name,
      }));
    } catch (error) {
      throw normalizeFireflyError(error as AxiosError, "Failed to fetch categories");
    }
  }

  async createTransaction(
    transaction: FireflyTransaction
  ): Promise<FireflyTransactionResponse> {
    try {
      const payload = {
        error_if_duplicate_hash: false,
        apply_rules: true,
        transactions: [transaction],
      };

      console.log(
        "[FireflyIII] Creating transaction:",
        JSON.stringify(payload, null, 2)
      );
      const response = await this.client.post<FireflyTransactionResponse>(
        "/transactions",
        payload
      );
      console.log("[FireflyIII] Transaction created:", response.data.data.id);
      return response.data;
    } catch (error) {
      throw normalizeFireflyError(error as AxiosError, "Failed to create transaction");
    }
  }

  async createExpenseFromDocument(params: {
    documentId: string;
    description: string;
    amount: number;
    date: string;
    vendor?: string;
    category?: string;
    notes?: string;
  }): Promise<FireflyTransactionResponse> {
    const transaction: FireflyTransaction = {
      type: "withdrawal",
      date: params.date,
      amount: (params.amount / 100).toFixed(2),
      description: params.description,
      destination_name: params.vendor || "Unknown Vendor",
      category_name: params.category,
      notes: params.notes
        ? `${params.notes}\n\nImported from Divorce Ledger - Document ID: ${params.documentId}`
        : `Imported from Divorce Ledger - Document ID: ${params.documentId}`,
      external_id: `divorce-ledger-doc-${params.documentId}`,
      tags: ["divorce-ledger", "imported"],
    };

    return this.createTransaction(transaction);
  }

  async createIncomeFromDocument(params: {
    documentId: string;
    description: string;
    amount: number;
    date: string;
    source?: string;
    category?: string;
    notes?: string;
  }): Promise<FireflyTransactionResponse> {
    const transaction: FireflyTransaction = {
      type: "deposit",
      date: params.date,
      amount: (params.amount / 100).toFixed(2),
      description: params.description,
      source_name: params.source || "Unknown Source",
      category_name: params.category,
      notes: params.notes
        ? `${params.notes}\n\nImported from Divorce Ledger - Document ID: ${params.documentId}`
        : `Imported from Divorce Ledger - Document ID: ${params.documentId}`,
      external_id: `divorce-ledger-doc-${params.documentId}`,
      tags: ["divorce-ledger", "imported"],
    };

    return this.createTransaction(transaction);
  }

  async syncExpense(expense: {
    id: string;
    documentId?: string | null;
    description?: string | null;
    amountCents: number;
    date: string;
    vendor?: string | null;
    category?: string | null;
  }): Promise<FireflyTransactionResponse> {
    const transaction: FireflyTransaction = {
      type: "withdrawal",
      date: expense.date,
      amount: (expense.amountCents / 100).toFixed(2),
      description: expense.description || "Expense",
      destination_name: expense.vendor || "Unknown Vendor",
      category_name: expense.category || undefined,
      notes: `Synced from Divorce Ledger - Expense ID: ${expense.id}`,
      external_id: `divorce-ledger-expense-${expense.id}`,
      tags: ["divorce-ledger", "synced"],
    };

    return this.createTransaction(transaction);
  }

  async syncIncome(income: {
    id: string;
    documentId?: string | null;
    source?: string | null;
    amountCents: number;
    date: string;
    description?: string | null;
  }): Promise<FireflyTransactionResponse> {
    const transaction: FireflyTransaction = {
      type: "deposit",
      date: income.date,
      amount: (income.amountCents / 100).toFixed(2),
      description: income.description || income.source || "Income",
      source_name: income.source || "Unknown Source",
      notes: `Synced from Divorce Ledger - Income ID: ${income.id}`,
      external_id: `divorce-ledger-income-${income.id}`,
      tags: ["divorce-ledger", "synced"],
    };

    return this.createTransaction(transaction);
  }

  async getTransactionByExternalId(
    externalId: string
  ): Promise<FireflyTransactionResponse | null> {
    try {
      const response = await this.client.get("/search/transactions", {
        params: { query: `external_id:"${externalId}"` },
      });
      if (response.data.data && response.data.data.length > 0) {
        return response.data.data[0];
      }
      return null;
    } catch (error) {
      console.error(
        "[FireflyIII] Failed to search transaction by external ID:",
        error
      );
      return null;
    }
  }
}

let fireflyInstance: FireflyIIIService | null = null;

export function getFireflyService(
  config?: FireflyConfig
): FireflyIIIService | null {
  if (config) {
    fireflyInstance = new FireflyIIIService(config);
    return fireflyInstance;
  }
  return fireflyInstance;
}

export function clearFireflyService(): void {
  fireflyInstance = null;
}
