// @ts-nocheck
import { ReactNode } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/24/outline';

interface WorkspaceStatusGuardProps {
  children: ReactNode;
}

export default function WorkspaceStatusGuard({ children }: WorkspaceStatusGuardProps) {
  const { activeWorkspace } = useWorkspaceStore();

  if (!activeWorkspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-yellow-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">No Workspace Selected</h2>
          <p className="mt-2 text-gray-600">
            Please select a workspace to continue.
          </p>
        </div>
      </div>
    );
  }

  if (activeWorkspace.workspace_status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <ClockIcon className="mx-auto h-12 w-12 text-blue-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Workspace Pending Approval</h2>
          <p className="mt-2 text-gray-600">
            Your {activeWorkspace.workspace_type} workspace "<strong>{activeWorkspace.workspace_name}</strong>" 
            is pending approval by our team.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            You'll receive an email notification once your workspace is approved. 
            This typically takes 1-2 business days.
          </p>
          <div className="mt-6">
            <a
              href="/auth/login"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Return to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (activeWorkspace.workspace_status === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Workspace Suspended</h2>
          <p className="mt-2 text-gray-600">
            Your workspace "<strong>{activeWorkspace.workspace_name}</strong>" has been suspended.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            Please contact support for more information.
          </p>
          <div className="mt-6">
            <a
              href="mailto:support@divorcelegder.com"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
