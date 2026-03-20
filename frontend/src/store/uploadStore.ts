import { create } from 'zustand';
import { api } from '@/lib/api';
import { storage } from '@/lib/supabase';

export interface UploadProgress {
  id: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
}

interface UploadState {
  uploads: UploadProgress[];
  storageUsage: {
    used: number;
    limit: number;
    percentage: number;
  } | null;
  loading: boolean;
  error: string | null;

  // Actions
  uploadFile: (
    file: File,
    documentType?: string,
    metadata?: Record<string, any>
  ) => Promise<string>;
  removeUpload: (id: string) => void;
  fetchStorageUsage: () => Promise<void>;
  clearError: () => void;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  uploads: [],
  storageUsage: null,
  loading: false,
  error: null,

  uploadFile: async (file, documentType, metadata) => {
    const uploadId = crypto.randomUUID();
    const filename = file.name;
    const mimeType = file.type;
    const fileSize = file.size;

    // Add to uploads list
    set((state) => ({
      uploads: [
        ...state.uploads,
        {
          id: uploadId,
          filename,
          progress: 0,
          status: 'pending',
        },
      ],
    }));

    try {
      // Step 1: Generate signed upload URL
      set((state) => ({
        uploads: state.uploads.map((upload) =>
          upload.id === uploadId ? { ...upload, status: 'uploading', progress: 10 } : upload
        ),
      }));

      const urlResponse = await api.uploads.generateUrl({
        filename,
        mimeType,
        fileSize,
        documentType,
        metadata,
      });

      const { upload_url, file_path } = urlResponse.data.data;

      // Step 2: Upload file to storage using signed URL
      set((state) => ({
        uploads: state.uploads.map((upload) =>
          upload.id === uploadId ? { ...upload, progress: 30 } : upload
        ),
      }));

      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': mimeType,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Complete upload and create document record
      set((state) => ({
        uploads: state.uploads.map((upload) =>
          upload.id === uploadId ? { ...upload, progress: 70, status: 'processing' } : upload
        ),
      }));

      const completeResponse = await api.uploads.complete(
        {
          filename,
          mimeType,
          fileSize,
          documentType,
          metadata,
        },
        file_path
      );

      const documentId = completeResponse.data.data.id;

      // Step 4: Mark as completed
      set((state) => ({
        uploads: state.uploads.map((upload) =>
          upload.id === uploadId ? { ...upload, progress: 100, status: 'completed' } : upload
        ),
      }));

      // Remove from list after 3 seconds
      setTimeout(() => {
        get().removeUpload(uploadId);
      }, 3000);

      // Refresh storage usage
      get().fetchStorageUsage();

      return documentId;
    } catch (error: any) {
      set((state) => ({
        uploads: state.uploads.map((upload) =>
          upload.id === uploadId ? { ...upload, status: 'failed', error: error.message } : upload
        ),
        error: error.message,
      }));

      throw error;
    }
  },

  removeUpload: (id) => {
    set((state) => ({
      uploads: state.uploads.filter((upload) => upload.id !== id),
    }));
  },

  fetchStorageUsage: async () => {
    try {
      const response = await api.uploads.storage();
      set({ storageUsage: response.data.data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  clearError: () => set({ error: null }),
}));
