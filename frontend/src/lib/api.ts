import axios, { AxiosInstance, AxiosError } from 'axios';
import { supabase } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  async (config) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<any>) => {
    // Handle 401 Unauthorized - refresh token or redirect to login
    if (error.response?.status === 401) {
      // Try to refresh session
      const {
        data: { session },
        error: refreshError,
      } = await supabase.auth.refreshSession();

      if (refreshError || !session) {
        // Redirect to login
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        return Promise.reject(error);
      }

      // Retry original request with new token
      if (error.config) {
        error.config.headers.Authorization = `Bearer ${session.access_token}`;
        return apiClient.request(error.config);
      }
    }

    // Format error message
    const errorMessage =
      error.response?.data?.error?.message || error.message || 'An error occurred';

    return Promise.reject(new Error(errorMessage));
  }
);

// API methods
export const api = {
  // Documents
  documents: {
    list: (params?: Record<string, any>) => apiClient.get('/documents', { params }),
    get: (id: string) => apiClient.get(`/documents/${id}`),
    create: (data: any) => apiClient.post('/documents', data),
    update: (id: string, data: any) => apiClient.patch(`/documents/${id}`, data),
    delete: (id: string, permanent = false) =>
      apiClient.delete(`/documents/${id}`, { params: { permanent } }),
    classify: (id: string) => apiClient.post(`/documents/${id}/classify`),
    versions: (id: string) => apiClient.get(`/documents/${id}/versions`),
    stats: () => apiClient.get('/documents/stats'),
  },

  // Uploads
  uploads: {
    generateUrl: (metadata: any) => apiClient.post('/uploads/generate-url', metadata),
    complete: (metadata: any, filePath: string) =>
      apiClient.post('/uploads/complete', { metadata, filePath }),
    upload: (formData: FormData) =>
      apiClient.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    storage: () => apiClient.get('/uploads/storage'),
  },

  // Classifications
  classifications: {
    list: (params?: Record<string, any>) => apiClient.get('/classifications', { params }),
    get: (documentId: string) => apiClient.get(`/classifications/document/${documentId}`),
    stats: () => apiClient.get('/classifications/stats'),
    search: (query: string, params?: Record<string, any>) =>
      apiClient.get('/classifications/search', { params: { q: query, ...params } }),
  },

  // Auth (if using backend auth instead of Supabase directly)
  auth: {
    signup: (data: any) => apiClient.post('/auth/signup', data),
    login: (data: any) => apiClient.post('/auth/login', data),
    logout: () => apiClient.post('/auth/logout'),
    session: () => apiClient.get('/auth/session'),
    refresh: (refreshToken: string) => apiClient.post('/auth/refresh', { refreshToken }),
    passwordResetRequest: (email: string) =>
      apiClient.post('/auth/password/reset-request', { email }),
    passwordUpdate: (newPassword: string) =>
      apiClient.post('/auth/password/update', { newPassword }),
  },

  // Health
  health: () => apiClient.get('/health'),
};

export default apiClient;
