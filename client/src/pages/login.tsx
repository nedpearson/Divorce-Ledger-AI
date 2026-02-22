import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Briefcase, Eye, EyeOff, Loader2, ArrowLeft, Smartphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth, type LoginResult, getDeviceFingerprint } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { EnvironmentBadge } from "@/components/environment-badge";
import type { Environment } from "@shared/schema";

interface TwoFactorState {
  userId: string;
  maskedPhone: string;
  environment: string;
  rememberMe: boolean;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, completeLogin, setEnvironment, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("demo123");
  const [showPassword, setShowPassword] = useState(false);
  const [environment, setEnv] = useState<Environment>("demo");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(() => 
    localStorage.getItem("rememberMe") === "true"
  );
  
  // 2FA state
  const [twoFactorState, setTwoFactorState] = useState<TwoFactorState | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);


  useEffect(() => {
    if (isAuthenticated) {
      const params = new URLSearchParams(window.location.search);
      const redirectUrl = params.get("redirect") || "/home";
      setLocation(redirectUrl);
    }
  }, [isAuthenticated, setLocation]);
  
  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleEnvironmentChange = (env: Environment) => {
    setEnv(env);
    setEnvironment(env);
    setError("");
    setTwoFactorState(null);
    if (env === "demo") {
      setEmail("demo@example.com");
      setPassword("demo123");
    } else {
      setEmail("");
      setPassword("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await login(email, password, environment, rememberMe);
    
    if ('requires2fa' in result && result.requires2fa) {
      // 2FA required - show verification form
      setTwoFactorState({
        userId: result.userId,
        maskedPhone: result.maskedPhone,
        environment: result.environment,
        rememberMe: result.rememberMe,
      });
      setResendCooldown(30);
      toast({
        title: "Verification Code Sent",
        description: `A code has been sent to ${result.maskedPhone}`,
      });
    } else if ('success' in result && !result.success) {
      // Login failed
      setError(result.error || "Invalid email or password. Please try again.");
    }
    // If success is true, auth context already updated and useEffect will redirect
    
    setIsLoading(false);
  };
  
  const handleVerify2FA = async () => {
    if (!twoFactorState || verificationCode.length !== 6) return;
    
    setIsVerifying(true);
    setError("");
    
    try {
      const deviceFingerprint = getDeviceFingerprint();
      const response = await apiRequest("POST", "/api/auth/2fa/verify", {
        userId: twoFactorState.userId,
        code: verificationCode,
        rememberMe: twoFactorState.rememberMe,
        deviceFingerprint,
      });
      
      const data = await response.json();
      
      // 2FA verified - complete login via auth context
      completeLogin(data.user, data.environment);
      
      // Clear 2FA state
      setTwoFactorState(null);
      setVerificationCode("");
      
      toast({
        title: "Verification Successful",
        description: "You have been signed in securely.",
      });
      // Auth context updated, useEffect will handle redirect
    } catch (err) {
      setError("Verification failed. Please try again.");
    }
    setIsVerifying(false);
  };
  
  const handleResendCode = async () => {
    if (!twoFactorState || resendCooldown > 0) return;
    
    setError("");
    
    try {
      const response = await apiRequest("POST", "/api/auth/2fa/send", { userId: twoFactorState.userId });
      
      const data = await response.json();
      
      setResendCooldown(30);
      setVerificationCode("");
      toast({
        title: "Code Resent",
        description: `A new code has been sent to ${twoFactorState.maskedPhone}`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to resend code. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleBack = () => {
    setTwoFactorState(null);
    setVerificationCode("");
    setError("");
  };

  const isDemoEnv = environment === "demo";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-end p-4">
        <div className="flex items-center gap-3">
          <EnvironmentBadge className="hidden sm:inline-flex" />
          <ThemeToggle />
        </div>
      </header>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="p-2 bg-primary rounded-lg">
                <Briefcase className="h-6 w-6 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl font-semibold">Divorce Ledger</CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Forensic Financial & Legal Case Management
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="sm:hidden flex justify-center mb-2">
              <EnvironmentBadge />
            </div>

            {twoFactorState ? (
              // 2FA Verification Form
              <div className="space-y-6">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="flex items-center gap-1 -ml-2"
                  data-testid="button-back-to-login"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                
                <div className="text-center space-y-2">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Smartphone className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium">Enter Verification Code</h3>
                  <p className="text-sm text-muted-foreground">
                    We sent a 6-digit code to {twoFactorState.maskedPhone}
                  </p>
                </div>
                
                <div className="flex justify-center">
                  <InputOTP
                    value={verificationCode}
                    onChange={setVerificationCode}
                    maxLength={6}
                    data-testid="input-otp"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                
                {error && (
                  <div className="text-sm text-destructive text-center" data-testid="text-2fa-error">
                    {error}
                  </div>
                )}
                
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleVerify2FA}
                  disabled={isVerifying || verificationCode.length !== 6}
                  data-testid="button-verify-code"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Code"
                  )}
                </Button>
                
                <div className="text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResendCode}
                    disabled={resendCooldown > 0}
                    className="text-muted-foreground"
                    data-testid="button-resend-code"
                  >
                    {resendCooldown > 0 ? (
                      <>Resend in {resendCooldown}s</>
                    ) : (
                      <>
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Resend Code
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              // Login Form
              <>
                <div className="flex gap-2 p-1 bg-muted rounded-lg">
                  <Button
                    type="button"
                    variant={environment === "live" ? "default" : "ghost"}
                    className="flex-1"
                    onClick={() => handleEnvironmentChange("live")}
                    data-testid="button-env-live"
                  >
                    LIVE
                  </Button>
                  <Button
                    type="button"
                    variant={environment === "demo" ? "default" : "ghost"}
                    className="flex-1"
                    onClick={() => handleEnvironmentChange("demo")}
                    data-testid="button-env-demo"
                  >
                    DEMO
                  </Button>
                </div>

                {environment === "demo" && (
                  <div className="text-center text-xs text-muted-foreground bg-accent/50 rounded-md p-2">
                    Demo credentials pre-filled. Data resets nightly.
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
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
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="password" className="text-sm">Password</Label>
                      <Link
                        href="/forgot-password"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="link-forgot-password"
                      >
                        Forgot Password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
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

                  {environment === "live" && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="rememberMe"
                        checked={rememberMe}
                        onCheckedChange={(checked) => {
                          setRememberMe(!!checked);
                          localStorage.setItem("rememberMe", checked ? "true" : "false");
                        }}
                        data-testid="checkbox-remember-me"
                      />
                      <Label htmlFor="rememberMe" className="text-sm cursor-pointer">
                        Remember me on this device
                      </Label>
                    </div>
                  )}

                  {error && (
                    <div className="text-sm text-destructive text-center" data-testid="text-error">
                      {error}
                    </div>
                  )}

                  {isDemoEnv && (
                    <div className="mt-2 rounded-md border border-dashed border-orange-300 bg-orange-50 px-3 py-2 text-xs text-orange-900 space-y-1">
                      <p className="font-medium text-[11px] uppercase tracking-wide text-orange-700">
                        Demo accounts
                      </p>
                      <p>
                        <span className="font-semibold">Client portal:</span> client.demo@example.com / demo1234
                      </p>
                      <p>
                        <span className="font-semibold">Firm admin:</span> firm.admin.demo@example.com / demo1234
                      </p>
                      <p className="text-[11px] text-orange-700/80">
                        Use these in demo mode, or your own email/password in live.
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-login"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or sign in with</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={environment === "demo"}
                  data-testid="button-google-signin"
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Don't have an account?{" "}
                  <Link
                    href="/signup"
                    className="text-primary hover:underline"
                    data-testid="link-signup"
                  >
                    Sign Up
                  </Link>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <footer className="text-center text-xs text-muted-foreground p-4 space-y-1">
        <p>Secure, encrypted, and compliant with legal industry standards.</p>
        <Link
          href="/admin"
          className="text-muted-foreground/60 hover:text-primary hover:underline"
          data-testid="link-admin-console"
        >
          Admin Console
        </Link>
      </footer>
    </div>
  );
}
