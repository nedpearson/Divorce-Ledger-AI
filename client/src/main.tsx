import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setupGlobalErrorHandlers } from "./lib/error-logger";

setupGlobalErrorHandlers();

// Register the service worker.
// The new sw.js never intercepts navigation requests so the old
// "refresh loop" bug cannot recur. It handles:
//   • GET /api/mobile/*  → network-first with offline cache fallback
//   • Static assets      → network-first with cache fallback
//   • POST/PATCH/DELETE  → not intercepted (client queues mutations offline)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Check for SW updates on every page load
        registration.update();

        // If a new SW is already waiting, activate it immediately
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      })
      .catch((err) => {
        // SW registration failed — app still works, just without offline support
        console.warn("Service worker registration failed:", err);
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
