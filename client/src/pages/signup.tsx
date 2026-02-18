import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Briefcase, Eye, EyeOff, Loader2, ArrowLeft, Phone, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileAppSignupCard } from "@/components/mobile-app-banner";
import type { Environment } from "@shared/schema";

function formatPhoneNumber(value: string): string {
  const cleaned = value.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned.slice(0, 16);
  }
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function toE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function isValidE164(phone: string): boolean {
  const e164 = toE164(phone);
  return /^\+[1-9]\d{10,14}$/.test(e164);
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const { login, setEnvironment, isAuthenticated } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [environment, setEnv] = useState<Environment>("live");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    if (fullName.length < 2) {
      setError("Full name must be at least 2 characters");
      setIsLoading(false);
      return;
    }

    if (!isValidE164(phoneNumber)) {
      setError("Please enter a valid phone number (US: 10 digits, or international with + prefix)");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email, 
          password, 
          fullName, 
          phoneNumber: toE164(phoneNumber),
          environment 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to create account");
        setIsLoading(false);
        return;
      }

      setSuccess("Account created successfully! Signing you in...");
      
      setTimeout(async () => {
        const loginSuccess = await login(email, password, environment);
        if (!loginSuccess) {
          setError("Account created but failed to sign in. Please go to login page.");
        }
      }, 1000);
    } catch (err) {
      setError("Failed to create account. Please try again.");
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          data-testid="button-back-to-login"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Login
        </Button>
        <ThemeToggle />
      </header>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="p-2 bg-primary rounded-lg">
                <Briefcase className="h-6 w-6 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl font-semibold">Create Account</CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Join Divorce Ledger - Forensic Financial & Legal Case Management
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <Button
                type="button"
                variant={environment === "live" ? "default" : "ghost"}
                className="flex-1"
                onClick={() => { setEnv("live"); setEnvironment("live"); }}
                data-testid="button-env-live"
              >
                LIVE
              </Button>
              <Button
                type="button"
                variant={environment === "demo" ? "default" : "ghost"}
                className="flex-1"
                onClick={() => { setEnv("demo"); setEnvironment("demo"); }}
                data-testid="button-env-demo"
              >
                DEMO
              </Button>
            </div>

            {environment === "demo" && (
              <div className="text-center text-xs text-muted-foreground bg-accent/50 rounded-md p-2">
                Demo accounts are reset nightly. Use LIVE for permanent accounts.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  data-testid="input-fullname"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber" className="text-sm">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phoneNumber"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                    required
                    className="pl-10"
                    data-testid="input-phone"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Required for two-factor authentication via SMS
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                    data-testid="input-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  data-testid="input-confirm-password"
                />
              </div>

              {error && (
                <div className="text-sm text-destructive text-center" data-testid="text-error">
                  {error}
                </div>
              )}

              {success && (
                <div data-testid="text-success" className="space-y-1">
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {success}
                  </div>
                  <MobileAppSignupCard />
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-signup"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setLocation("/")}
                className="text-primary hover:underline"
                data-testid="link-login"
              >
                Sign In
              </button>
            </p>

            <p className="text-center text-xs text-muted-foreground pt-2">
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </p>
          </CardContent>
        </Card>
      </div>

      <footer className="text-center text-xs text-muted-foreground p-4">
        Secure, encrypted, and compliant with legal industry standards.
      </footer>
    </div>
  );
}
