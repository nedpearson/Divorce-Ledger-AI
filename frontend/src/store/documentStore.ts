import { create } from 'zustand';
import { api } from '@/lib/api';

export interface Document {
  id: string;
  user_id: string;
  storage_path: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  document_type: 'financial' | 'legal' | 'custody' | 'property' | 'communication' | 'other';
  status: 'pending' | 'processing' | 'classified' | 'failed';
  metadata: Record<string, any>;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  classifications?: Classification[];
}

export interface Classification {
  id: string;
  primary_category: string;
  confidence_score: number;
  entities: string[];
  sentiment: string;
  created_at: string;
}

interface DocumentState {
  documents: Document[];
  currentDocument: Document | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  filters: {
    document_type?: string;
    status?: string;
    search?: string;
  };

  // Actions
  fetchDocuments: (page?: number) => Promise<void>;
  fetchDocument: (id: string) => Promise<void>;
  deleteDocument: (id: string, permanent?: boolean) => Promise<void>;
  updateDocument: (id: string, data: Partial<Document>) => Promise<void>;
  classifyDocument: (id: string) => Promise<void>;
  setFilters: (filters: Partial<DocumentState['filters']>) => void;
  clearError: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentDocument: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
  },
  filters: {},

  fetchDocuments: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const { filters, pagination } = get();
      const response = await api.documents.list({
        page,
        limit: pagination.limit,
        ...filters,
      });

      set({
        documents: response.data.data,
        pagination: {
          page: response.data.pagination.page,
          limit: response.data.pagination.limit,
          total: response.data.pagination.total,
        },
        loading: false,
      });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchDocument: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await api.documents.get(id);
      set({ currentDocument: response.data.data, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  deleteDocument: async (id, permanent = false) => {
    set({ loading: true, error: null });
    try {
      await api.documents.delete(id, permanent);
      set({ loading: false });
      // Refresh document list
      get().fetchDocuments(get().pagination.page);
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  updateDocument: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const response = await api.documents.update(id, data);
      set({ currentDocument: response.data.data, loading: false });
      // Update in list if present
      const documents = get().documents.map((doc) => (doc.id === id ? response.data.data : doc));
      set({ documents });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  classifyDocument: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.documents.classify(id);
      set({ loading: false });
      // Optionally refetch document to get updated status
      setTimeout(() => get().fetchDocument(id), 2000);
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  setFilters: (filters) => {
    set({ filters: { ...get().filters, ...filters } });
    // Reset to page 1 when filters change
    get().fetchDocuments(1);
  },

  clearError: () => set({ error: null }),
}));
