import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClassifyPayload {
  document_id: string;
  job_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { document_id, job_id }: ClassifyPayload = await req.json();

    if (!document_id) {
      throw new Error('Missing required field: document_id');
    }

    console.log(`Starting classification for document ${document_id}`);
    const startTime = Date.now();

    // Update job status if provided
    if (job_id) {
      await supabaseClient
        .from('jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
        })
        .eq('id', job_id);
    }

    // Fetch document details
    const { data: document, error: docError } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${document_id}`);
    }

    // Download file from storage
    const { data: fileData, error: storageError } = await supabaseClient.storage
      .from('documents_raw')
      .download(document.storage_path);

    if (storageError) {
      throw new Error(`Failed to download file: ${storageError.message}`);
    }

    // Extract text content (simplified - in production, use proper PDF/DOCX parsers)
    const fileContent = await extractTextContent(fileData, document.mime_type);

    // Perform classification (stubbed - integrate with OpenAI/Gemini/Claude in production)
    const classificationResult = await classifyDocument(fileContent, document);

    // Save classification results
    const { data: classification, error: classifyError } = await supabaseClient
      .from('classifications')
      .insert({
        document_id,
        classification_type: 'ai_automated',
        confidence_score: classificationResult.confidence,
        primary_category: classificationResult.primaryCategory,
        secondary_categories: classificationResult.secondaryCategories,
        extracted_entities: classificationResult.entities,
        sentiment_analysis: classificationResult.sentiment,
        key_dates: classificationResult.dates,
        parties_involved: classificationResult.parties,
        financial_data: classificationResult.financial,
        legal_citations: classificationResult.citations,
        summary: classificationResult.summary,
        model_used: classificationResult.modelUsed,
        model_version: classificationResult.modelVersion,
        processing_time_ms: Date.now() - startTime,
      })
      .select()
      .single();

    if (classifyError) {
      throw new Error(`Failed to save classification: ${classifyError.message}`);
    }

    // Update document status
    await supabaseClient
      .from('documents')
      .update({
        status: 'classified',
        updated_at: new Date().toISOString(),
      })
      .eq('id', document_id);

    // Update job as completed
    if (job_id) {
      await supabaseClient
        .from('jobs')
        .update({
          status: 'completed',
          progress_percent: 100,
          completed_at: new Date().toISOString(),
          output_data: {
            classification_id: classification.id,
            primary_category: classificationResult.primaryCategory,
          },
        })
        .eq('id', job_id);
    }

    // Log audit event
    await supabaseClient.from('audit_logs').insert({
      user_id: document.user_id,
      action: 'document_classified',
      resource_type: 'document',
      resource_id: document_id,
      metadata: {
        classification_id: classification.id,
        confidence: classificationResult.confidence,
        category: classificationResult.primaryCategory,
        processing_time_ms: Date.now() - startTime,
      },
      severity: 'info',
    });

    console.log(`Classification completed for document ${document_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        classification,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Classification error:', error);

    // If we have a job_id, mark it as failed
    if (error.job_id) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      await supabaseClient
        .from('jobs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', error.job_id);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// Extract text from various file formats
async function extractTextContent(fileData: Blob, mimeType: string): Promise<string> {
  // In production, use proper libraries:
  // - PDF: pdf-parse, pdfjs-dist
  // - DOCX: mammoth, docx
  // - Images: tesseract.js (OCR)

  if (mimeType === 'text/plain') {
    return await fileData.text();
  }

  // Stubbed for other formats - integrate proper parsers
  console.warn(`Text extraction not implemented for ${mimeType}, using placeholder`);
  return `[Extracted text from ${mimeType} file]`;
}

// AI Classification logic (integrate with OpenAI/Gemini/Claude)
async function classifyDocument(content: string, document: any) {
  // In production, call your AI provider:
  //
  // const response = await fetch('https://api.openai.com/v1/chat/completions', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     model: 'gpt-4',
  //     messages: [{
  //       role: 'system',
  //       content: 'You are a legal document classifier...',
  //     }, {
  //       role: 'user',
  //       content: `Classify this document:\n\n${content}`,
  //     }],
  //   }),
  // });

  // Stubbed classification result
  return {
    confidence: 0.85,
    primaryCategory: getPrimaryCategory(document.document_type),
    secondaryCategories: ['legal', 'financial'],
    entities: {
      people: ['John Doe', 'Jane Smith'],
      organizations: ['ABC Law Firm'],
      locations: ['California'],
    },
    sentiment: {
      score: 0.2,
      label: 'neutral',
    },
    dates: [
      { date: '2026-01-15', context: 'Filing date' },
      { date: '2026-03-20', context: 'Court hearing' },
    ],
    parties: [
      { name: 'John Doe', role: 'Petitioner' },
      { name: 'Jane Smith', role: 'Respondent' },
    ],
    financial: {
      amounts: [{ amount: 50000, currency: 'USD', context: 'Child support' }],
      accounts: [],
    },
    citations: [
      { citation: 'Family Code § 3600', jurisdiction: 'California' },
    ],
    summary:
      'This is a court filing document related to child custody and support proceedings between two parties.',
    modelUsed: 'gpt-4',
    modelVersion: '2024-01-01',
  };
}

function getPrimaryCategory(docType: string): string {
  const mapping: Record<string, string> = {
    court_filing: 'Court Filing',
    financial: 'Financial Document',
    custody: 'Custody Agreement',
    property: 'Property Settlement',
    communication: 'Communication',
    evidence: 'Evidence',
    legal_brief: 'Legal Brief',
  };
  return mapping[docType] || 'Other';
}
