import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessUploadPayload {
  document_id: string;
  file_path: string;
  user_id: string;
  file_size: number;
  mime_type: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Parse request body
    const payload: ProcessUploadPayload = await req.json();
    const { document_id, file_path, user_id, file_size, mime_type } = payload;

    // Validate required fields
    if (!document_id || !file_path || !user_id) {
      throw new Error('Missing required fields: document_id, file_path, user_id');
    }

    console.log(`Processing upload for document ${document_id}`);

    // 1. Verify file exists in storage
    const { data: fileData, error: fileError } = await supabaseClient.storage
      .from('documents_raw')
      .download(file_path);

    if (fileError) {
      throw new Error(`File not found in storage: ${fileError.message}`);
    }

    // 2. Update document status to 'processing'
    const { error: updateError } = await supabaseClient
      .from('documents')
      .update({
        status: 'processing',
        storage_path: file_path,
        file_size_bytes: file_size,
        mime_type: mime_type,
        updated_at: new Date().toISOString(),
      })
      .eq('id', document_id);

    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }

    // 3. Create initial document version
    const { error: versionError } = await supabaseClient.from('document_versions').insert({
      document_id,
      version_number: 1,
      storage_path: file_path,
      file_size_bytes: file_size,
      mime_type: mime_type,
      checksum: await calculateChecksum(fileData),
      changes_description: 'Initial upload',
      created_by: user_id,
    });

    if (versionError) {
      throw new Error(`Failed to create version: ${versionError.message}`);
    }

    // 4. Create job for classification
    const { data: jobData, error: jobError } = await supabaseClient
      .from('jobs')
      .insert({
        document_id,
        user_id,
        job_type: 'classification',
        status: 'queued',
        priority: 5,
        input_data: { file_path, mime_type },
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create classification job: ${jobError.message}`);
    }

    // 5. Create job for thumbnail generation
    const { error: thumbnailJobError } = await supabaseClient.from('jobs').insert({
      document_id,
      user_id,
      job_type: 'thumbnail',
      status: 'queued',
      priority: 7,
      input_data: { file_path, document_id },
    });

    if (thumbnailJobError) {
      console.error('Thumbnail job creation failed (non-critical):', thumbnailJobError);
    }

    // 6. Log audit event
    await supabaseClient.from('audit_logs').insert({
      user_id,
      action: 'document_uploaded',
      resource_type: 'document',
      resource_id: document_id,
      metadata: {
        file_path,
        file_size,
        mime_type,
        classification_job_id: jobData.id,
      },
      severity: 'info',
    });

    // 7. Trigger classification function (async)
    try {
      await supabaseClient.functions.invoke('classify-document', {
        body: { document_id, job_id: jobData.id },
      });
    } catch (error) {
      console.error('Failed to trigger classification (non-critical):', error);
    }

    console.log(`Upload processing completed for document ${document_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        classification_job_id: jobData.id,
        message: 'Document uploaded and processing queued',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error processing upload:', error);

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

// Helper function to calculate file checksum
async function calculateChecksum(fileData: Blob): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
