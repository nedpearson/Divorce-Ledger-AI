import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

let _geminiClient: GoogleGenAI | null = null;
let _openaiClient: OpenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!_geminiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key not configured for capture service');
    }
    _geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });
  }
  return _geminiClient;
}

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured for capture service');
    }
    _openaiClient = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openaiClient;
}

const gemini = { get: () => getGeminiClient() };
const openai = { get: () => getOpenAIClient() };

export interface FinancialData {
  amount: number;
  vendor: string;
  date: string;
  type: "income" | "expense" | "asset" | "debt";
  description?: string;
}

export interface CaptureAnalysisResult {
  title: string;
  category: string;
  extractedText: string;
  suggestedLink: string;
  confidence: number;
  financialData?: FinancialData;
}

const DOCUMENT_CATEGORIES = [
  "financial",
  "tax",
  "legal",
  "custody",
  "medical",
  "property",
  "correspondence",
  "other",
];

const VIOLATION_TYPES = [
  "custody",
  "financial_hiding",
  "harassment",
  "child_neglect",
  "court_order",
  "property_damage",
  "other",
];

export async function analyzeDocumentImage(
  base64Image: string,
  mimeType: string,
  fileName: string
): Promise<CaptureAnalysisResult> {
  try {
    const response = await gemini.get().models.generateContent({
      model: "gemini-2.0-flash", // Reverting to stable or known version
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
            {
              text: `You are a legal document analyst for divorce proceedings. Your task is to perform OCR and extract ALL text from this document image.

IMPORTANT: Extract the COMPLETE text content from the document - every word, every paragraph, every section. Do not summarize or truncate.

Provide a JSON response with:
1. "title": A descriptive title for this document (max 50 chars)
2. "category": One of: ${DOCUMENT_CATEGORIES.join(", ")}
3. "extractedText": The COMPLETE text content you can read from the document. Extract EVERYTHING - all paragraphs, all sections, all text visible in the image. Do NOT summarize.
4. "suggestedLink": Where this should be linked - one of: "finances", "timeline", "case", "evidence"
5. "confidence": Your confidence in this analysis from 0.0 to 1.0
6. "financialData": Optional object if this is a receipt or financial statement: { "amount": number, "vendor": string, "date": string, "type": "income"|"expense"|"asset"|"debt" }

The file name is: ${fileName}

Respond ONLY with valid JSON, no additional text.`,
            },
          ],
        },
      ],
    });

    const content = response.text || "{}";
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleanedContent);

    const financialData = result.financialData && result.financialData.amount 
      ? {
          amount: parseFloat(result.financialData.amount) || 0,
          vendor: result.financialData.vendor || "Unknown",
          date: result.financialData.date || new Date().toISOString().split("T")[0],
          type: ["income", "expense", "asset", "debt"].includes(result.financialData.type) 
            ? result.financialData.type 
            : "expense",
          description: result.financialData.description || result.title,
        } as FinancialData
      : undefined;

    return {
      title: result.title || fileName.replace(/\.[^/.]+$/, ""),
      category: DOCUMENT_CATEGORIES.includes(result.category) ? result.category : "other",
      extractedText: result.extractedText || "Document content extracted",
      suggestedLink: result.suggestedLink || "finances",
      confidence: Math.max(0, Math.min(1, parseFloat(result.confidence) || 0.7)),
      financialData,
    };
  } catch (error) {
    console.error("Document image analysis failed:", error);
    return {
      title: fileName.replace(/\.[^/.]+$/, ""),
      category: "other",
      extractedText: "Unable to analyze document - please review manually",
      suggestedLink: "case",
      confidence: 0,
    };
  }
}

export async function analyzeViolationImage(
  base64Image: string,
  mimeType: string,
  fileName: string
): Promise<CaptureAnalysisResult> {
  try {
    const response = await gemini.get().models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
            {
              text: `You are a legal analyst reviewing evidence of potential court order violations in divorce proceedings. Analyze this image and extract ALL text or describe everything you see in detail.

IMPORTANT: If there is text in the image, extract ALL of it completely. If it's a photo, describe everything visible in detail.

Provide a JSON response with:
1. "title": A descriptive title for this evidence (max 50 chars)
2. "category": The type of violation - one of: ${VIOLATION_TYPES.join(", ")}
3. "extractedText": If this contains text, extract ALL text completely. If it's a photo, provide a detailed description of everything visible. Do NOT summarize or truncate.
4. "suggestedLink": Where this should be linked - one of: "timeline", "case", "evidence"
5. "confidence": Your confidence in this analysis from 0.0 to 1.0

The file name is: ${fileName}

Respond ONLY with valid JSON, no additional text.`,
            },
          ],
        },
      ],
    });

    const content = response.text || "{}";
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleanedContent);

    return {
      title: result.title || "Violation Evidence",
      category: VIOLATION_TYPES.includes(result.category) ? result.category : "other",
      extractedText: result.extractedText || "Evidence captured - please review",
      suggestedLink: result.suggestedLink || "timeline",
      confidence: Math.max(0, Math.min(1, parseFloat(result.confidence) || 0.7)),
    };
  } catch (error) {
    console.error("Violation image analysis failed:", error);
    return {
      title: "Violation Evidence",
      category: "other",
      extractedText: "Unable to analyze image - please review manually",
      suggestedLink: "timeline",
      confidence: 0,
    };
  }
}

export async function transcribeVoiceNote(
  base64Audio: string,
  mimeType: string,
  type: "document" | "violation"
): Promise<CaptureAnalysisResult> {
  try {
    const categories = type === "document" ? DOCUMENT_CATEGORIES : VIOLATION_TYPES;
    
    const response = await gemini.get().models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: `You are a legal assistant for divorce proceedings. Listen to this audio recording and transcribe it, then analyze the content.

${type === "document" 
  ? "This recording is describing a document or financial information."
  : "This recording is describing a potential court order violation."}

Provide a JSON response with:
1. "title": A descriptive title based on the audio content (max 50 chars)
2. "category": Categorize the content - one of: ${categories.join(", ")}
3. "extractedText": The full transcription of the audio (max 1000 chars)
4. "suggestedLink": Where this should be linked - one of: ${type === "document" ? '"finances", "case", "evidence"' : '"timeline", "case", "evidence"'}
5. "confidence": Your confidence in the transcription accuracy from 0.0 to 1.0

Respond ONLY with valid JSON, no additional text.`,
            },
          ],
        },
      ],
    });

    const content = response.text || "{}";
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleanedContent);

    return {
      title: result.title || "Voice Note",
      category: categories.includes(result.category) ? result.category : "other",
      extractedText: result.extractedText || "Voice note transcription",
      suggestedLink: result.suggestedLink || (type === "document" ? "finances" : "timeline"),
      confidence: Math.max(0, Math.min(1, parseFloat(result.confidence) || 0.7)),
    };
  } catch (error) {
    console.error("Voice transcription failed:", error);
    return {
      title: "Voice Note",
      category: "other",
      extractedText: "Unable to transcribe audio - please review manually",
      suggestedLink: type === "document" ? "finances" : "timeline",
      confidence: 0,
    };
  }
}

export async function analyzeDocumentText(
  text: string,
  fileName: string
): Promise<CaptureAnalysisResult> {
  try {
    const response = await openai.get().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `You are a legal document analyst for divorce proceedings. Analyze this document content and categorize it.

Document Name: ${fileName}
Content: ${text.slice(0, 2000)}

Provide a JSON response with:
1. "title": A descriptive title for this document (max 50 chars)
2. "category": One of: ${DOCUMENT_CATEGORIES.join(", ")}
3. "extractedText": A summary of the key points (max 500 chars)
4. "suggestedLink": Where this should be linked - one of: "finances", "timeline", "case", "evidence"
5. "confidence": Your confidence from 0.0 to 1.0

Respond ONLY with valid JSON.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    return {
      title: result.title || fileName.replace(/\.[^/.]+$/, ""),
      category: DOCUMENT_CATEGORIES.includes(result.category) ? result.category : "other",
      extractedText: result.extractedText || text.slice(0, 500),
      suggestedLink: result.suggestedLink || "case",
      confidence: Math.max(0, Math.min(1, parseFloat(result.confidence) || 0.7)),
    };
  } catch (error) {
    console.error("Document text analysis failed:", error);
    return {
      title: fileName.replace(/\.[^/.]+$/, ""),
      category: "other",
      extractedText: text.slice(0, 500),
      suggestedLink: "case",
      confidence: 0,
    };
  }
}
