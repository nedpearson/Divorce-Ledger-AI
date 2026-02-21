import React, { useState } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { useUpload } from '@/hooks/useUpload';
import { auth } from '@/lib/supabase';
import { User, Mail, Shield, HardDrive, Lock, AlertCircle, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const { storageUsage, storagePercentage } = useUpload();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      await auth.updatePassword(newPassword);
      setSuccess('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <Layout>
        <Head>
          <title>Settings - Divorce Ledger AI</title>
        </Head>

        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="mt-2 text-gray-600">Manage your account and preferences</p>
          </div>

          {/* Profile Section */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <User className="h-5 w-5 mr-2" />
              Profile Information
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="inline h-4 w-4 mr-1" />
                  Email
                </label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Email cannot be changed. Contact support if you need to update it.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Shield className="inline h-4 w-4 mr-1" />
                  Subscription Tier
                </label>
                <input
                  type="text"
                  value={user?.user_metadata?.subscription_tier || 'free'}
                  disabled
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed capitalize"
                />
              </div>
            </div>
          </div>

          {/* Storage Section */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <HardDrive className="h-5 w-5 mr-2" />
              Storage Usage
            </h2>

            {storageUsage ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">
                    {(storageUsage.used / 1024 / 1024).toFixed(2)} MB of{' '}
                    {(storageUsage.limit / 1024 / 1024).toFixed(0)} MB used
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {storagePercentage.toFixed(1)}%
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      storagePercentage >= 90
                        ? 'bg-red-600'
                        : storagePercentage >= 75
                        ? 'bg-yellow-500'
                        : 'bg-green-600'
                    }`}
                    style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                  ></div>
                </div>

                {storagePercentage >= 90 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">
                      <AlertCircle className="inline h-4 w-4 mr-1" />
                      You're running out of storage space. Consider upgrading your plan or deleting
                      old documents.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Loading storage information...</div>
            )}
          </div>

          {/* Password Change Section */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <Lock className="h-5 w-5 mr-2" />
              Change Password
            </h2>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  placeholder="••••••••"
                />
                <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters</p>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700"
                >
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="flex items-center p-3 text-sm text-red-800 bg-red-50 rounded-lg">
                  <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center p-3 text-sm text-green-800 bg-green-50 rounded-lg">
                  <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-red-200">
            <h2 className="text-lg font-semibold text-red-900 mb-4">Danger Zone</h2>
            <p className="text-sm text-gray-600 mb-4">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <button
              onClick={() => {
                alert('Account deletion is not implemented yet. Please contact support.');
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Delete Account
            </button>
          </div>
        </div>
      </Layout>
    </AuthGuard>
  );
}
