import { useEffect } from 'react';
import { useUploadStore } from '@/store/uploadStore';

export function useUpload() {
  const {
    uploads,
    storageUsage,
    loading,
    error,
    uploadFile,
    removeUpload,
    fetchStorageUsage,
    clearError,
  } = useUploadStore();

  useEffect(() => {
    if (!storageUsage) {
      fetchStorageUsage();
    }
  }, [storageUsage, fetchStorageUsage]);

  const isStorageExceeded = storageUsage ? storageUsage.used >= storageUsage.limit : false;

  const storagePercentage = storageUsage ? storageUsage.percentage : 0;

  return {
    uploads,
    storageUsage,
    loading,
    error,
    uploadFile,
    removeUpload,
    fetchStorageUsage,
    clearError,
    isStorageExceeded,
    storagePercentage,
    activeUploads: uploads.filter((u) => u.status === 'uploading' || u.status === 'processing'),
  };
}
