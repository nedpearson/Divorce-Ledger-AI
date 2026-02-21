import React, { useRef, useState } from 'react';
import { useUpload } from '@/hooks/useUpload';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';

interface UploadButtonProps {
  onUploadComplete?: (documentId: string) => void;
}

export default function UploadButton({ onUploadComplete }: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploads, isStorageExceeded, storagePercentage } = useUpload();
  const [error, setError] = useState<string | null>(null);

  const handleButtonClick = () => {
    if (isStorageExceeded) {
      setError('Storage quota exceeded. Please delete some files or upgrade your plan.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size exceeds 50MB limit');
      return;
    }

    try {
      setError(null);
      const documentId = await uploadFile(file);
      if (onUploadComplete) {
        onUploadComplete(documentId);
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      {/* Upload button */}
      <button
        onClick={handleButtonClick}
        disabled={isStorageExceeded}
        className={`flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
          isStorageExceeded
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-primary-600 hover:bg-primary-700'
        }`}
      >
        <Upload className="w-4 h-4 mr-2" />
        Upload Document
      </button>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.webm"
        onChange={handleFileChange}
      />

      {/* Error message */}
      {error && (
        <div className="mt-2 flex items-center text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mr-1" />
          {error}
        </div>
      )}

      {/* Storage usage */}
      {storagePercentage > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Storage</span>
            <span>{storagePercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                storagePercentage > 90
                  ? 'bg-red-600'
                  : storagePercentage > 75
                  ? 'bg-yellow-600'
                  : 'bg-primary-600'
              }`}
              style={{ width: `${Math.min(storagePercentage, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload progress list */}
      {uploads.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="flex items-center justify-between p-3 bg-white border rounded-lg"
            >
              <div className="flex items-center flex-1 min-w-0">
                {upload.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : upload.status === 'failed' ? (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 flex-shrink-0">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
                  </div>
                )}
                <div className="ml-3 flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {upload.filename}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">{upload.status}</p>
                </div>
              </div>
              {upload.status === 'uploading' || upload.status === 'processing' ? (
                <div className="ml-3 flex-shrink-0">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
