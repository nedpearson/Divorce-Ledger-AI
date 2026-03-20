/**
 * Backend Intake Orchestrator Service
 *
 * Sits between the application layer and the Document Intake Engine.
 * Handles OCR requests, intake engine calls, result validation,
 * persistence, and approval screen preparation.
 *
 * All financial data MUST be traceable back to original documents.
 */

import {
  analyzeDocumentWithIntake,
  mapDocTypeToCategory,
  mapCategoryToRecordType,
  DocumentIntakeResult,
  SourceTrace,
  LedgerAction,
  documentIntakeResultSchema,
  validateSourceTraceCompleteness,
} from './document-intake.service';
import { analyzeDocumentImage } from './ai-capture.service';
import { z } from 'zod';

// ==================== INPUT SCHEMA ====================

export interface DocumentUploadEvent {
  event_type: 'DOCUMENT_UPLOADED';
  ui_language: string;
  file: {
    file_id: string;
    file_name: string;
    mime_type: string;
    storage_url: string | null;
    pages: number | null;
  };
  ocr: {
    raw_text: string | null;
    language_hint: string | null;
    engine: 'tesseract' | 'vision_api' | 'unknown' | null;
  };
  user_context: {
    user_id: string;
    matter_id: string;
    jurisdiction: string;
    currency: string;
  };
  existing_context: {
    known_accounts: string[];
    known_vendors: string[];
    known_categories: string[];
    open_transactions: any[];
    approval_policies: {
      require_manual_confirmation_for_all: boolean;
      auto_approve_low_risk: boolean;
    };
  };
  intake_engine_result?: DocumentIntakeResult;
}

// ==================== OUTPUT SCHEMA ====================

export type OrchestratorStatus =
  | 'ok'
  | 'needs_ocr'
  | 'intake_error'
  | 'schema_error'
  | 'fatal_error';

export type ActionType =
  | 'REQUEST_OCR'
  | 'CALL_INTAKE_ENGINE'
  | 'PERSIST_INTAKE_RESULT'
  | 'PREPARE_APPROVAL_SCREEN'
  | 'LOG_WARNING'
  | 'LOG_ERROR'
  | 'NO_OP';

export interface RequestOcrPayload {
  file_id: string;
  storage_url: string | null;
  preferred_engine: 'vision_api' | 'tesseract';
  reason: string;
}

export interface CallIntakeEnginePayload {
  engine_name: string;
  engine_input: {
    raw_text: string;
    file_name: string;
    mime_type: string;
    language_hint: string;
    ui_language: string;
    existing_context: {
      known_accounts: string[];
      known_vendors: string[];
      known_categories: string[];
      user_profile: {
        jurisdiction: string;
        currency: string;
      };
    };
  };
}

export interface PersistIntakeResultPayload {
  file_id: string;
  user_id: string;
  matter_id: string;
  doc_type: string;
  doc_language: string;
  normalized_payload: DocumentIntakeResult;
  approval_state: 'PENDING' | 'APPROVED' | 'REJECTED';
  errors_or_warnings: string[];
}

export interface PrepareApprovalScreenPayload {
  user_id: string;
  matter_id: string;
  ui_language: string;
  file_id: string;
  message_to_user: string;
  questions_for_user: string[];
  fields_user_should_review: string[];
  proposed_ledger_actions: LedgerAction[];
  source_trace: SourceTrace[];
}

export interface LogPayload {
  code: string;
  details: string;
  context: Record<string, any>;
}

export interface OrchestratorAction {
  type: ActionType;
  payload:
    | RequestOcrPayload
    | CallIntakeEnginePayload
    | PersistIntakeResultPayload
    | PrepareApprovalScreenPayload
    | LogPayload
    | Record<string, never>;
}

export interface OrchestratorResponse {
  status: OrchestratorStatus;
  actions: OrchestratorAction[];
}

// ==================== VALIDATION HELPERS ====================
// Uses canonical schema from document-intake.service.ts

function isOcrTextValid(rawText: string | null): boolean {
  if (!rawText) return false;
  const cleaned = rawText.trim();
  if (cleaned.length < 20) return false;
  const alphanumericRatio = (cleaned.match(/[a-zA-Z0-9]/g) || []).length / cleaned.length;
  return alphanumericRatio > 0.3;
}

function validateIntakeEngineResult(result: any): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  // Use canonical Zod schema from document-intake.service.ts
  const zodResult = documentIntakeResultSchema.safeParse(result);
  if (!zodResult.success) {
    const errors = zodResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return { valid: false, errors, warnings: [] };
  }

  // Use canonical source_trace validation from document-intake.service.ts
  const traceValidation = validateSourceTraceCompleteness(zodResult.data as DocumentIntakeResult);

  return {
    valid: traceValidation.valid,
    errors: traceValidation.errors,
    warnings: traceValidation.warnings,
  };
}

// ==================== ORCHESTRATOR MAIN FUNCTION (PLANNING ONLY) ====================

export async function processDocumentUploadEvent(
  event: DocumentUploadEvent
): Promise<OrchestratorResponse> {
  const actions: OrchestratorAction[] = [];

  // Step 1: Validate event_type
  if (event.event_type !== 'DOCUMENT_UPLOADED') {
    return {
      status: 'fatal_error',
      actions: [
        {
          type: 'LOG_ERROR',
          payload: {
            code: 'INVALID_EVENT_TYPE',
            details: `Expected event_type 'DOCUMENT_UPLOADED', got '${event.event_type}'`,
            context: { file_id: event.file?.file_id || 'unknown' },
          },
        },
      ],
    };
  }

  // Step 2: If intake_engine_result is provided, validate and prepare approval
  if (event.intake_engine_result) {
    const validation = validateIntakeEngineResult(event.intake_engine_result);

    // Add warnings as LOG_WARNING actions
    for (const warning of validation.warnings) {
      actions.push({
        type: 'LOG_WARNING',
        payload: {
          code: 'INTAKE_VALIDATION_WARNING',
          details: warning,
          context: { file_id: event.file.file_id },
        },
      });
    }

    if (!validation.valid) {
      return {
        status: 'schema_error',
        actions: [
          {
            type: 'LOG_ERROR',
            payload: {
              code: 'INTAKE_SCHEMA_MISMATCH',
              details: validation.errors.join('; '),
              context: { file_id: event.file.file_id },
            },
          },
          ...actions,
        ],
      };
    }

    const result = event.intake_engine_result;

    // Emit PERSIST_INTAKE_RESULT action
    actions.push({
      type: 'PERSIST_INTAKE_RESULT',
      payload: {
        file_id: event.file.file_id,
        user_id: event.user_context.user_id,
        matter_id: event.user_context.matter_id,
        doc_type: result.doc_type,
        doc_language: result.doc_language,
        normalized_payload: result, // Store FULL original result
        approval_state: 'PENDING',
        errors_or_warnings: [...result.errors_or_warnings, ...validation.warnings],
      },
    });

    // Emit PREPARE_APPROVAL_SCREEN action
    actions.push({
      type: 'PREPARE_APPROVAL_SCREEN',
      payload: {
        user_id: event.user_context.user_id,
        matter_id: event.user_context.matter_id,
        ui_language: event.ui_language,
        file_id: event.file.file_id,
        message_to_user: result.approval_request.message_to_user,
        questions_for_user: result.approval_request.questions_for_user,
        fields_user_should_review: result.approval_request.fields_user_should_review,
        proposed_ledger_actions: result.ledger_actions_proposed,
        source_trace: result.source_trace,
      },
    });

    return { status: 'ok', actions };
  }

  // Step 3: Check if OCR is needed
  if (!isOcrTextValid(event.ocr.raw_text)) {
    const ocrActions: OrchestratorAction[] = [
      {
        type: 'REQUEST_OCR',
        payload: {
          file_id: event.file.file_id,
          storage_url: event.file.storage_url,
          preferred_engine: 'vision_api',
          reason: event.ocr.raw_text
            ? 'OCR text appears incomplete or low quality; re-OCR recommended.'
            : 'No OCR text provided in event; need OCR before intake.',
        },
      },
    ];

    if (event.ocr.raw_text && event.ocr.raw_text.length < 50) {
      ocrActions.push({
        type: 'LOG_WARNING',
        payload: {
          code: 'SHORT_OCR_TEXT',
          details: `OCR text length is only ${event.ocr.raw_text.length} characters`,
          context: { file_id: event.file.file_id },
        },
      });
    }

    return { status: 'needs_ocr', actions: ocrActions };
  }

  // Step 4: OCR is valid, emit CALL_INTAKE_ENGINE action
  const engineInput: CallIntakeEnginePayload = {
    engine_name: 'document_intake_auto_categorization_v1',
    engine_input: {
      raw_text: event.ocr.raw_text!,
      file_name: event.file.file_name,
      mime_type: event.file.mime_type,
      language_hint: event.ocr.language_hint || 'en',
      ui_language: event.ui_language,
      existing_context: {
        known_accounts: event.existing_context.known_accounts,
        known_vendors: event.existing_context.known_vendors,
        known_categories: event.existing_context.known_categories,
        user_profile: {
          jurisdiction: event.user_context.jurisdiction,
          currency: event.user_context.currency,
        },
      },
    },
  };

  return {
    status: 'ok',
    actions: [
      {
        type: 'CALL_INTAKE_ENGINE',
        payload: engineInput,
      },
    ],
  };
}

// ==================== EXECUTE ORCHESTRATOR ACTIONS ====================

export async function executeOrchestratorActions(
  event: DocumentUploadEvent,
  response: OrchestratorResponse
): Promise<{
  finalResponse: OrchestratorResponse;
  intakeResult?: DocumentIntakeResult;
  persistedData?: PersistIntakeResultPayload;
  approvalScreen?: PrepareApprovalScreenPayload;
}> {
  let intakeResult: DocumentIntakeResult | undefined;
  let persistedData: PersistIntakeResultPayload | undefined;
  let approvalScreen: PrepareApprovalScreenPayload | undefined;

  for (const action of response.actions) {
    switch (action.type) {
      case 'REQUEST_OCR': {
        const payload = action.payload as RequestOcrPayload;
        if (payload.storage_url) {
          try {
            const ocrResult = await analyzeDocumentImage(
              payload.storage_url,
              event.file.mime_type,
              event.file.file_name
            );

            // Update event with OCR result and re-process
            const updatedEvent: DocumentUploadEvent = {
              ...event,
              ocr: {
                raw_text: ocrResult.extractedText || '',
                language_hint: event.ocr.language_hint,
                engine: 'vision_api',
              },
            };

            const newResponse = await processDocumentUploadEvent(updatedEvent);
            return executeOrchestratorActions(updatedEvent, newResponse);
          } catch (error) {
            console.error('OCR execution failed:', error);
            return {
              finalResponse: {
                status: 'intake_error',
                actions: [
                  {
                    type: 'LOG_ERROR',
                    payload: {
                      code: 'OCR_FAILED',
                      details: error instanceof Error ? error.message : 'Unknown OCR error',
                      context: { file_id: event.file.file_id },
                    },
                  },
                ],
              },
            };
          }
        }
        break;
      }

      case 'CALL_INTAKE_ENGINE': {
        const payload = action.payload as CallIntakeEnginePayload;
        try {
          const result = await analyzeDocumentWithIntake(
            payload.engine_input.raw_text,
            payload.engine_input.file_name,
            payload.engine_input.mime_type,
            payload.engine_input.language_hint,
            payload.engine_input.ui_language,
            {
              known_vendors: payload.engine_input.existing_context.known_vendors,
              known_categories:
                payload.engine_input.existing_context.known_categories.length > 0
                  ? payload.engine_input.existing_context.known_categories
                  : undefined,
              user_profile: payload.engine_input.existing_context.user_profile,
            }
          );

          intakeResult = result;

          // Update event with intake result and re-process for validation/approval
          const updatedEvent: DocumentUploadEvent = {
            ...event,
            intake_engine_result: result,
          };

          const newResponse = await processDocumentUploadEvent(updatedEvent);
          return executeOrchestratorActions(updatedEvent, newResponse);
        } catch (error) {
          console.error('Intake engine call failed:', error);
          return {
            finalResponse: {
              status: 'intake_error',
              actions: [
                {
                  type: 'LOG_ERROR',
                  payload: {
                    code: 'INTAKE_ENGINE_FAILED',
                    details: error instanceof Error ? error.message : 'Unknown error',
                    context: { file_id: event.file.file_id },
                  },
                },
              ],
            },
          };
        }
      }

      case 'PERSIST_INTAKE_RESULT': {
        persistedData = action.payload as PersistIntakeResultPayload;
        // Actual persistence would happen here via storage layer
        console.log(
          `[PERSIST] Document ${persistedData.file_id} - ${persistedData.doc_type} (${persistedData.approval_state})`
        );
        break;
      }

      case 'PREPARE_APPROVAL_SCREEN': {
        approvalScreen = action.payload as PrepareApprovalScreenPayload;
        // Approval screen data is returned to frontend
        console.log(`[APPROVAL] Preparing screen for ${approvalScreen.file_id}`);
        break;
      }

      case 'LOG_WARNING': {
        const payload = action.payload as LogPayload;
        console.warn(`[WARNING] ${payload.code}: ${payload.details}`, payload.context);
        break;
      }

      case 'LOG_ERROR': {
        const payload = action.payload as LogPayload;
        console.error(`[ERROR] ${payload.code}: ${payload.details}`, payload.context);
        break;
      }

      case 'NO_OP':
        // Do nothing
        break;
    }
  }

  return {
    finalResponse: response,
    intakeResult: intakeResult || event.intake_engine_result,
    persistedData,
    approvalScreen,
  };
}
