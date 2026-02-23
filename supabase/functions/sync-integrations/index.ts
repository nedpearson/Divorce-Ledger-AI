import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SyncRequest {
  user_id: string;
  integration_type: 'google_drive' | 'dropbox' | 'onedrive';
  force?: boolean;
}

interface ExternalFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  downloadUrl?: string;
}

serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user_id, integration_type, force = false }: SyncRequest = await req.json();

    if (!user_id || !integration_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, integration_type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    console.log(`Starting sync for user ${user_id} with ${integration_type}`);

    // Get integration credentials
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user_id)
      .eq('integration_type', integration_type)
      .eq('status', 'active')
      .single();

    if (integrationError || !integration) {
      throw new Error(`Integration not found or inactive: ${integrationError?.message}`);
    }

    // Decrypt credentials (in production, use proper encryption)
    const credentials = integration.credentials as any;

    // Fetch files from external service
    let externalFiles: ExternalFile[];

    switch (integration_type) {
      case 'google_drive':
        externalFiles = await fetchGoogleDriveFiles(credentials);
        break;
      case 'dropbox':
        externalFiles = await fetchDropboxFiles(credentials);
        break;
      case 'onedrive':
        externalFiles = await fetchOneDriveFiles(credentials);
        break;
      default:
        throw new Error(`Unsupported integration type: ${integration_type}`);
    }

    console.log(`Found ${externalFiles.length} files in ${integration_type}`);

    // Process each file
    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of externalFiles) {
      try {
        // Check if file already exists
        const { data: existingDoc } = await supabase
          .from('documents')
          .select('id, updated_at')
          .eq('user_id', user_id)
          .eq('metadata->>external_id', file.id)
          .single();

        // Skip if already synced and not forced
        if (existingDoc && !force) {
          const existingUpdated = new Date(existingDoc.updated_at);
          const fileModified = new Date(file.modifiedTime);
          
          if (fileModified <= existingUpdated) {
            skipped++;
            continue;
          }
        }

        // Download file from external service
        const fileBlob = await downloadExternalFile(file, credentials, integration_type);

        // Upload to Supabase storage
        const storagePath = `${user_id}/${crypto.randomUUID()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, fileBlob, {
            contentType: file.mimeType,
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Failed to upload file: ${uploadError.message}`);
        }

        // Create or update document record
        const documentData = {
          user_id,
          storage_path: storagePath,
          original_filename: file.name,
          file_size: file.size,
          mime_type: file.mimeType,
          status: 'pending',
          metadata: {
            external_id: file.id,
            external_source: integration_type,
            external_modified: file.modifiedTime,
            synced_at: new Date().toISOString(),
          },
        };

        if (existingDoc) {
          // Update existing document
          const { error: updateError } = await supabase
            .from('documents')
            .update(documentData)
            .eq('id', existingDoc.id);

          if (updateError) {
            throw new Error(`Failed to update document: ${updateError.message}`);
          }
        } else {
          // Create new document
          const { error: createError } = await supabase
            .from('documents')
            .insert(documentData);

          if (createError) {
            throw new Error(`Failed to create document: ${createError.message}`);
          }
        }

        synced++;
        console.log(`Synced file: ${file.name}`);
      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError);
        errors++;
      }
    }

    // Update integration last_sync timestamp
    await supabase
      .from('integrations')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', integration.id);

    console.log(`Sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        skipped,
        errors,
        total: externalFiles.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error syncing integrations:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Fetch files from Google Drive
 */
async function fetchGoogleDriveFiles(credentials: any): Promise<ExternalFile[]> {
  // In production, use Google Drive API with proper OAuth
  console.log('Fetching files from Google Drive (placeholder)');
  
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id,name,mimeType,size,modifiedTime)',
    {
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Google Drive API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Fetch files from Dropbox
 */
async function fetchDropboxFiles(credentials: any): Promise<ExternalFile[]> {
  // In production, use Dropbox API
  console.log('Fetching files from Dropbox (placeholder)');
  
  const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: '',
      recursive: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Dropbox API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  return (data.entries || []).map((entry: any) => ({
    id: entry.id,
    name: entry.name,
    mimeType: entry['.tag'] === 'folder' ? 'folder' : 'application/octet-stream',
    size: entry.size || 0,
    modifiedTime: entry.client_modified,
  }));
}

/**
 * Fetch files from OneDrive
 */
async function fetchOneDriveFiles(credentials: any): Promise<ExternalFile[]> {
  // In production, use Microsoft Graph API
  console.log('Fetching files from OneDrive (placeholder)');
  
  const response = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OneDrive API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  return (data.value || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    mimeType: item.file?.mimeType || 'application/octet-stream',
    size: item.size || 0,
    modifiedTime: item.lastModifiedDateTime,
  }));
}

/**
 * Download file from external service
 */
async function downloadExternalFile(
  file: ExternalFile,
  credentials: any,
  integrationType: string
): Promise<Blob> {
  let downloadUrl: string;

  switch (integrationType) {
    case 'google_drive':
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
      break;
    case 'dropbox': {
      // Dropbox uses a different endpoint
      const dropboxResponse = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: file.id }),
        },
      });
      return await dropboxResponse.blob();
    }
    case 'onedrive':
      downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/content`;
      break;
    default:
      throw new Error(`Unsupported integration type: ${integrationType}`);
  }

  const response = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  return await response.blob();
}
