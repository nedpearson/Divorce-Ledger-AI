import OpenAI from "openai";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@shared/schema";
import { AI_CREDIT_COSTS } from "@shared/workspace-schema";
import {
  consumeCredits,
  refundCredits,
  InsufficientCreditsError,
} from "./ai-credits.service";

let _openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured for AI document service');
    }
    _openaiClient = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openaiClient;
}

const openai = { get: () => getOpenAIClient() };

export interface DocumentAnalysisResult {
  category: DocumentCategory;
  confidence: number;
  summary: string;
  suggestedTags: string[];
  isEvidence: boolean;
  relevanceScore: number;
}

const CATEGORY_DESCRIPTIONS: Record<DocumentCategory, string> = {
  financial_statement: "Bank statements, investment reports, account summaries",
  tax_return: "Federal or state tax returns, W-2s, 1099s",
  bank_statement: "Monthly bank account statements showing transactions",
  property_deed: "Real estate deeds, titles, property ownership documents",
  court_order: "Court orders, judgments, legal rulings",
  custody_agreement: "Child custody agreements, parenting plans",
  correspondence: "Emails, letters, text messages, communications",
  evidence_photo: "Photographs used as evidence",
  evidence_video: "Video recordings used as evidence",
  legal_filing: "Legal documents filed with courts, petitions, motions",
  medical_record: "Medical records, health documents, doctor notes",
  employment_record: "Employment contracts, pay stubs, HR documents",
  insurance_document: "Insurance policies, claims, coverage documents",
  asset_valuation: "Appraisals, valuations of property or assets",
  debt_statement: "Credit card statements, loan documents, debt records",
  other: "Documents that don't fit other categories",
};

export async function analyzeDocument(
  fileName: string,
  fileType: string,
  description?: string,
  workspaceId?: string,
  userId?: string | number
): Promise<DocumentAnalysisResult> {
  const categoryList = DOCUMENT_CATEGORIES.map(
    (cat) => `- ${cat}: ${CATEGORY_DESCRIPTIONS[cat]}`
  ).join("\n");

  const prompt = `You are an expert legal document analyst for divorce proceedings. Analyze the following document and categorize it appropriately.

Document Information:
- File Name: ${fileName}
- File Type: ${fileType}
${description ? `- Description: ${description}` : ""}

Available Categories:
${categoryList}

Please analyze this document and respond with a JSON object containing:
1. "category": The most appropriate category from the list above
2. "confidence": A confidence score from 0.0 to 1.0
3. "summary": A brief 1-2 sentence summary of what this document likely contains
4. "suggestedTags": An array of 3-5 relevant tags for organizing this document
5. "isEvidence": Boolean indicating if this could be used as evidence in court
6. "relevanceScore": A score from 0.0 to 1.0 indicating relevance to divorce proceedings

Respond ONLY with the JSON object, no additional text.`;

  const cost = AI_CREDIT_COSTS.documentClassification;
  let charged = false;

  if (workspaceId && userId !== undefined) {
    const chargeResult = await consumeCredits(
      workspaceId,
      userId,
      cost,
      "document_classification",
      { fileName, fileType }
    );

    if (!chargeResult.success) {
      throw new InsufficientCreditsError(chargeResult.error);
    }

    charged = true;
  }

  try {
    const response = await openai.get().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    // Validate and sanitize the response
    const category = DOCUMENT_CATEGORIES.includes(result.category)
      ? result.category
      : "other";

    return {
      category: category as DocumentCategory,
      confidence: Math.max(0, Math.min(1, parseFloat(result.confidence) || 0.5)),
      summary: result.summary || "Document analysis in progress",
      suggestedTags: Array.isArray(result.suggestedTags)
        ? result.suggestedTags.slice(0, 5)
        : [],
      isEvidence: Boolean(result.isEvidence),
      relevanceScore: Math.max(0, Math.min(1, parseFloat(result.relevanceScore) || 0.5)),
    };
  } catch (error) {
    if (charged && workspaceId && userId !== undefined) {
      await refundCredits(
        workspaceId,
        userId,
        cost,
        "document_classification_failed"
      );
    }
    console.error("AI document analysis failed:", error);
    // Return default values on error
    return {
      category: "other",
      confidence: 0,
      summary: "Analysis failed - please review manually",
      suggestedTags: [],
      isEvidence: false,
      relevanceScore: 0,
    };
  }
}

export async function classifyViolation(
  description: string,
  evidence?: string[],
  workspaceId?: string,
  userId?: string | number
): Promise<{
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  suggestedTitle: string;
  legalRelevance: string;
}> {
  const prompt = `You are a legal expert analyzing potential court order violations in divorce proceedings.

Violation Description:
${description}

${evidence?.length ? `Supporting Evidence: ${evidence.join(", ")}` : ""}

Analyze this potential violation and respond with a JSON object containing:
1. "type": The type of violation (e.g., "custody_interference", "financial_disclosure", "property_violation", "communication_violation", "support_payment", "other")
2. "severity": The severity level ("low", "medium", "high", or "critical")
3. "suggestedTitle": A concise title for this violation report
4. "legalRelevance": A brief explanation of how this could be legally relevant

Respond ONLY with the JSON object, no additional text.`;

  const cost = AI_CREDIT_COSTS.sentimentAnalysis;
  let charged = false;

  if (workspaceId && userId !== undefined) {
    const chargeResult = await consumeCredits(
      workspaceId,
      userId,
      cost,
      "violation_classification",
      { evidenceCount: evidence?.length ?? 0 }
    );

    if (!chargeResult.success) {
      throw new InsufficientCreditsError(chargeResult.error);
    }

    charged = true;
  }

  try {
    const response = await openai.get().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    const validSeverities = ["low", "medium", "high", "critical"];
    const severity = validSeverities.includes(result.severity)
      ? result.severity
      : "medium";

    return {
      type: result.type || "other",
      severity: severity as "low" | "medium" | "high" | "critical",
      suggestedTitle: result.suggestedTitle || "Violation Report",
      legalRelevance: result.legalRelevance || "Review required",
    };
  } catch (error) {
    if (charged && workspaceId && userId !== undefined) {
      await refundCredits(
        workspaceId,
        userId,
        cost,
        "violation_classification_failed"
      );
    }
    console.error("AI violation classification failed:", error);
    return {
      type: "other",
      severity: "medium",
      suggestedTitle: "Violation Report",
      legalRelevance: "Manual review required",
    };
  }
}

export interface FinancialDataExtraction {
  recordType: "income" | "expense" | "asset" | "debt" | "unknown";
  category: string;
  description: string;
  amount: number | null;
  vendor: string | null;
  date: string | null;
  frequency: "monthly" | "weekly" | "biweekly" | "quarterly" | "annually" | "one-time";
  confidence: number;
  extractedText: string;
}

export async function extractFinancialData(
  fileName: string,
  fileType: string,
  ocrText?: string,
  workspaceId?: string,
  userId?: string | number
): Promise<FinancialDataExtraction> {
  const hasContent = ocrText && ocrText.trim().length > 0;

  const prompt = `You are an expert financial document analyst. Analyze this document and extract financial information for divorce proceedings.

Document Information:
- File Name: ${fileName}
- File Type: ${fileType}
${hasContent ? `\nExtracted Document Text:\n${ocrText}\n` : ""}

${hasContent ? "Based on the extracted text and file information" : "Based on the file name and type"}, determine what kind of financial record this represents and extract as much data as possible.

Respond with a JSON object containing:
1. "recordType": One of "income", "expense", "asset", "debt", or "unknown"
2. "category": The specific category (e.g., "Housing", "Utilities", "Salary", "Bank Account", "Mortgage", etc.)
3. "description": A clear description of what this document represents
4. "amount": The dollar amount if identifiable (number only, no symbols), or null
5. "vendor": The company/vendor/payee name if identifiable, or null
6. "date": The date in YYYY-MM-DD format if identifiable, or null
7. "frequency": How often this occurs ("monthly", "weekly", "biweekly", "quarterly", "annually", "one-time")
8. "confidence": Confidence score 0.0 to 1.0
9. "extractedText": A brief summary of what you identified

Common patterns:
- Bank statements → income or expense depending on context
- Pay stubs → income (Salary category)
- Utility bills → expense (Utilities category)
- Rent/mortgage statements → expense (Housing category)
- Property deeds → asset (Real Estate category)
- Credit card statements → debt (Credit Card category)
- Insurance documents → expense (Insurance category)
- Tax returns → income (Tax Return category)

Respond ONLY with the JSON object.`;

  const cost = AI_CREDIT_COSTS.documentParsing;
  let charged = false;

  if (workspaceId && userId !== undefined) {
    const chargeResult = await consumeCredits(
      workspaceId,
      userId,
      cost,
      "financial_data_extraction"
    );

    if (!chargeResult.success) {
      throw new InsufficientCreditsError(chargeResult.error);
    }

    charged = true;
  }

  try {
    const response = await openai.get().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    const validTypes = ["income", "expense", "asset", "debt", "unknown"];
    const recordType = validTypes.includes(result.recordType)
      ? result.recordType
      : "unknown";

    const validFrequencies = ["monthly", "weekly", "biweekly", "quarterly", "annually", "one-time"];
    const frequency = validFrequencies.includes(result.frequency)
      ? result.frequency
      : "monthly";

    return {
      recordType: recordType as FinancialDataExtraction["recordType"],
      category: result.category || "Other",
      description: result.description || fileName,
      amount: typeof result.amount === "number" ? result.amount : null,
      vendor: result.vendor || null,
      date: result.date || null,
      frequency: frequency as FinancialDataExtraction["frequency"],
      confidence: Math.max(0, Math.min(1, parseFloat(result.confidence) || 0.5)),
      extractedText: result.extractedText || "Document analyzed",
    };
  } catch (error) {
    if (charged && workspaceId && userId !== undefined) {
      await refundCredits(
        workspaceId,
        userId,
        cost,
        "financial_data_extraction_failed"
      );
    }
    console.error("AI financial data extraction failed:", error);
    return {
      recordType: "unknown",
      category: "Other",
      description: fileName,
      amount: null,
      vendor: null,
      date: null,
      frequency: "monthly",
      confidence: 0,
      extractedText: "Unable to extract data - please enter manually",
    };
  }
}

// Demo mode mock data for when AI is not available
export function getMockDocumentAnalysis(fileName: string): DocumentAnalysisResult {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  const categoryByExtension: Record<string, DocumentCategory> = {
    pdf: "legal_filing",
    doc: "correspondence",
    docx: "correspondence",
    xls: "financial_statement",
    xlsx: "financial_statement",
    jpg: "evidence_photo",
    jpeg: "evidence_photo",
    png: "evidence_photo",
    mp4: "evidence_video",
    mov: "evidence_video",
  };

  const category = categoryByExtension[extension] || "other";

  return {
    category,
    confidence: 0.85,
    summary: `This ${extension.toUpperCase()} document has been automatically categorized based on file type.`,
    suggestedTags: ["divorce", "evidence", category.replace("_", " ")],
    isEvidence: ["evidence_photo", "evidence_video", "correspondence"].includes(category),
    relevanceScore: 0.75,
  };
}
