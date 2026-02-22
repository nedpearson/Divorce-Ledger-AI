import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function MobileLinkPage() {
  const [, setLocation] = useLocation();
  const { completeLogin } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("Finishing secure sign-in on this device...");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");
        if (!token) {
          setStatus("error");
          setMessage("Missing sign-in token. Please open the mobile QR from your desktop again.");
          return;
        }

        const res = await fetch(`/api/mobile/auth/complete?token=${encodeURIComponent(token)}`, {
          credentials: "include",
        });

        if (!res.ok) {
          let errorMsg = "Unable to complete mobile sign-in. Your link may have expired.";
          try {
            const data = await res.json();
            if (data?.error) errorMsg = data.error;
          } catch {
            // ignore
          }
          if (!cancelled) {
            setStatus("error");
            setMessage(errorMsg);
          }
          return;
        }

        const data = await res.json();
        if (!data?.user || !data?.environment) {
          if (!cancelled) {
            setStatus("error");
            setMessage("Invalid response from server. Please try scanning the QR code again.");
          }
          return;
        }

        if (!cancelled) {
          completeLogin(data.user, data.environment);
          setStatus("success");
          setMessage("Signed in! Redirecting to Quick Capture...");
          // Small delay so user sees confirmation, then go to Quick Capture
          setTimeout(() => {
            setLocation("/home?source=pwa");
          }, 800);
        }
      } catch (error) {
        console.error("Mobile link error:", error);
        if (!cancelled) {
          setStatus("error");
          setMessage("Something went wrong finishing mobile sign-in. Please try again from your desktop.");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [completeLogin, setLocation]);

  const isLoading = status === "loading";
  const isError = status === "error";
  const isSuccess = status === "success";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md w-full bg-white shadow-xl rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          {isLoading && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
          {isError && <AlertTriangle className="h-5 w-5 text-destructive" />}
          {isSuccess && <CheckCircle2 className="h-5 w-5 text-green-500" />}
          <h1 className="text-lg font-semibold">Connecting Your Mobile App</h1>
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        {isError && (
          <div className="mt-2 text-xs text-muted-foreground space-y-1">
            <p>
              This usually means the link was used already or expired. For security, mobile links only work once and expire after a few minutes.
            </p>
            <p>
              Go back to your desktop, open the Mobile App button again, and scan the new QR code.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
