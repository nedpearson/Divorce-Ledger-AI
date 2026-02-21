import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ThumbnailRequest {
  document_id: string;
  storage_path: string;
  mime_type: string;
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

    const { document_id, storage_path, mime_type }: ThumbnailRequest = await req.json();

    if (!document_id || !storage_path || !mime_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: document_id, storage_path, mime_type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    console.log(`Generating thumbnail for document ${document_id}`);

    // Download original file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storage_path);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Generate thumbnail based on mime type
    let thumbnailBlob: Blob;

    if (mime_type.startsWith('image/')) {
      // For images, resize to 300x300
      // In production, use a library like sharp or imagemagick
      // For now, we'll use a placeholder approach
      thumbnailBlob = await generateImageThumbnail(fileData, mime_type);
    } else if (mime_type === 'application/pdf') {
      // For PDFs, render first page
      // In production, use pdf-lib or similar
      thumbnailBlob = await generatePdfThumbnail(fileData);
    } else {
      // For other files, create a placeholder thumbnail
      thumbnailBlob = await generatePlaceholderThumbnail(mime_type);
    }

    // Upload thumbnail to thumbnails bucket
    const thumbnailPath = `${document_id}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(thumbnailPath, thumbnailBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload thumbnail: ${uploadError.message}`);
    }

    console.log(`Thumbnail generated successfully: ${thumbnailPath}`);

    return new Response(
      JSON.stringify({
        success: true,
        thumbnail_path: thumbnailPath,
        document_id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error generating thumbnail:', error);

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
 * Generate thumbnail for image files
 * In production, use a proper image processing library
 */
async function generateImageThumbnail(file: Blob, mimeType: string): Promise<Blob> {
  // Placeholder: In production, resize image to 300x300
  // For now, return original (simplified implementation)
  console.log('Generating image thumbnail (placeholder implementation)');
  
  // In real implementation, use Deno's image processing or external service
  // For now, we'll just return a smaller version indication
  return file;
}

/**
 * Generate thumbnail for PDF files
 * In production, render first page using pdf-lib
 */
async function generatePdfThumbnail(file: Blob): Promise<Blob> {
  console.log('Generating PDF thumbnail (placeholder implementation)');
  
  // In real implementation:
  // 1. Use pdf-lib to load PDF
  // 2. Render first page to canvas
  // 3. Convert canvas to JPEG blob
  // For now, create a placeholder
  return createPlaceholderBlob('PDF', '#EF4444');
}

/**
 * Generate placeholder thumbnail for unsupported file types
 */
async function generatePlaceholderThumbnail(mimeType: string): Promise<Blob> {
  console.log(`Generating placeholder thumbnail for ${mimeType}`);
  
  const label = mimeType.split('/')[1]?.toUpperCase() || 'FILE';
  const color = '#6B7280'; // Gray for unknown types
  
  return createPlaceholderBlob(label, color);
}

/**
 * Create a simple colored placeholder blob
 * In production, use canvas or SVG to generate actual thumbnail image
 */
function createPlaceholderBlob(label: string, color: string): Blob {
  // Create SVG placeholder
  const svg = `
    <svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="300" fill="${color}"/>
      <text x="150" y="150" font-family="Arial" font-size="24" fill="white" text-anchor="middle" dominant-baseline="middle">
        ${label}
      </text>
    </svg>
  `;
  
  return new Blob([svg], { type: 'image/svg+xml' });
}
