import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { FileText, Upload, Shield, Sparkles, ArrowRight } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  React.useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push('/documents');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Divorce Ledger AI - Document Management for Legal Proceedings</title>
        <meta
          name="description"
          content="AI-powered document management and classification for divorce proceedings"
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
        {/* Header */}
        <header className="container mx-auto px-4 py-6">
          <nav className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-primary-600" />
              <span className="text-2xl font-bold text-gray-900">Divorce Ledger AI</span>
            </div>
            <div className="space-x-4">
              <Link
                href="/auth/login"
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Log In
              </Link>
              <Link
                href="/auth/signup"
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
              >
                Get Started
              </Link>
            </div>
          </nav>
        </header>

        {/* Hero Section */}
        <main className="container mx-auto px-4 py-20">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              AI-Powered Document Management for
              <span className="text-primary-600"> Legal Proceedings</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Organize, classify, and manage all your legal documents with the power of artificial
              intelligence. Built specifically for divorce and family law cases.
            </p>
            <div className="flex justify-center space-x-4">
              <Link
                href="/auth/signup"
                className="flex items-center px-6 py-3 text-lg font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <a
                href="#features"
                className="px-6 py-3 text-lg font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Learn More
              </a>
            </div>
          </div>

          {/* Features */}
          <div id="features" className="mt-32 grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="bg-primary-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <Upload className="h-6 w-6 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Easy Upload</h3>
              <p className="text-gray-600">
                Drag and drop your documents or upload from cloud storage. Support for PDF, Word,
                Excel, images, and audio files.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="bg-primary-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">AI Classification</h3>
              <p className="text-gray-600">
                Automatically classify documents by type, extract key information, and identify
                important dates and parties.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="bg-primary-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Secure & Private</h3>
              <p className="text-gray-600">
                Bank-level encryption, role-based access control, and comprehensive audit logging
                keep your documents safe.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-32 bg-primary-600 rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to streamline your legal document management?
            </h2>
            <p className="text-xl text-primary-100 mb-8">
              Join hundreds of attorneys and individuals managing their divorce proceedings more
              efficiently.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center px-8 py-4 text-lg font-medium text-primary-600 bg-white rounded-lg hover:bg-gray-100 transition-colors"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="container mx-auto px-4 py-8 mt-20 border-t">
          <div className="text-center text-gray-600">
            <p>&copy; 2026 Divorce Ledger AI. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
