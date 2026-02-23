import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User, Environment } from "@shared/schema";
import { supabase } from "./supabase";

// Generate a stable device fingerprint for trusted device tracking
function getDeviceFingerprint(): string {
  // Check if we already have a stored fingerprint
  const storedFingerprint = localStorage.getItem('deviceFingerprint');
  if (storedFingerprint) {
    return storedFingerprint;
  }
  
  // Generate a new fingerprint based on browser characteristics
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown',
    navigator.platform || 'unknown',
  ];
  
  // Create a simple hash of the components
  const fingerprint = components.join('|');
  const hash = fingerprint.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0).toString(36) + '-' + Date.now().toString(36);
  
  localStorage.setItem('deviceFingerprint', hash);
  return hash;
}

// Export for use in login page 2FA verification
export { getDeviceFingerprint };

export type LoginResult = 
  | { success: true }
  | { success: false; error: string }
  | { requires2fa: true; userId: string; maskedPhone: string; environment: string; rememberMe: boolean };

type AuthContextType = {
  user: User | null;
  environment: Environment;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, env: Environment, rememberMe?: boolean) => Promise<LoginResult>;
  completeLogin: (user: User, env: Environment) => void;
  logout: () => void;
  setEnvironment: (env: Environment) => void;
  checkSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getInitialEnvironment(): Environment {
  if (typeof window === "undefined") return "demo";
  return (localStorage.getItem("environment") as Environment) || "demo";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [environment, setEnvironmentState] = useState<Environment>(getInitialEnvironment);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = user !== null;

  const checkSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user as unknown as User);
      setEnvironmentState(getInitialEnvironment());
      localStorage.setItem("user", JSON.stringify(session.user));
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    checkSession().then(() => {
      if (isMounted) setIsLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user as unknown as User);
        localStorage.setItem("user", JSON.stringify(session.user));
      } else {
        setUser(null);
        localStorage.removeItem("user");
      }
    });
    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string, env: Environment, rememberMe = false): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const deviceFingerprint = getDeviceFingerprint();
      const normalizedEmail = email.trim().toLowerCase();
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password, environment: env, rememberMe, deviceFingerprint }),
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setIsLoading(false);
        return { success: false, error: data.error || "Login failed" };
      }
      
      // Check if 2FA is required
      if (data.requires2fa) {
        setIsLoading(false);
        return {
          requires2fa: true,
          userId: data.userId,
          maskedPhone: data.maskedPhone,
          environment: data.environment,
          rememberMe: data.rememberMe,
        };
      }
      
      // Direct login success
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("environment", data.environment || env);
      setUser(data.user);
      setEnvironmentState(data.environment || env);
      setIsLoading(false);
      return { success: true };
    } catch {
      setIsLoading(false);
      return { success: false, error: "Login failed" };
    }
  }, []);
  
  const completeLogin = useCallback((user: User, env: Environment) => {
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("environment", env);
    setUser(user);
    setEnvironmentState(env);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { 
        method: "POST",
        credentials: 'include'
      });
    } catch {}
    localStorage.removeItem("user");
    localStorage.removeItem("environment");
    setUser(null);
    if (window.location.pathname !== "/") {
      window.location.href = "/";
    }
  }, []);

  const setEnvironment = useCallback((env: Environment) => {
    setEnvironmentState(env);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      environment, 
      isAuthenticated, 
      isLoading,
      login,
      completeLogin,
      logout, 
      setEnvironment,
      checkSession
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
