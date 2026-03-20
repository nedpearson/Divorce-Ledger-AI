import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, MessageCircle, Home } from 'lucide-react';
import { logFrontendError } from '@/lib/error-logger';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorId?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    const errorId = `err_${Date.now().toString(36)}`;
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logFrontendError(error, {
      level: 'error',
      componentStack: errorInfo.componentStack || undefined,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorId: undefined });
  };

  handleGoHome = () => {
    window.location.href = '/home';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-md w-full" data-testid="error-boundary-card">
            <CardHeader className="flex flex-row items-center gap-2">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. You can try again or return to the home page.
              </p>
              {this.state.errorId && (
                <p className="text-xs text-muted-foreground">Error ID: {this.state.errorId}</p>
              )}
              <div className="flex flex-col gap-2">
                <Button className="w-full" onClick={this.handleRetry} data-testid="button-retry">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={this.handleGoHome}
                  data-testid="button-go-home"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Go to Home
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() =>
                    window.open(
                      'mailto:support@divorceledger.live?subject=Error%20Report%20' +
                        this.state.errorId,
                      '_blank'
                    )
                  }
                  data-testid="button-contact-support"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Contact Support
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
