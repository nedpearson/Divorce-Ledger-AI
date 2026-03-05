import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from "@shared/schema";
import { useAuth } from "./auth";

interface SubscriptionData {
  tier: string;
  tierInfo: typeof SUBSCRIPTION_TIERS[SubscriptionTier];
  usage: {
    casesCount: number;
    violationsCountThisMonth: number;
    remainingViolations: number | null;
    remainingCases: number | null;
  };
  subscription: {
    status: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  };
  allTiers: typeof SUBSCRIPTION_TIERS;
}

interface SubscriptionContextType {
  data: SubscriptionData | undefined;
  isLoading: boolean;
  refetch: () => void;
  isPro: boolean;
  isTeam: boolean;
  isEnterprise: boolean;
  canUseAI: boolean;
  hasWatermark: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { environment } = useAuth();
  const { data, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    staleTime: 1000 * 60 * 5,
  });

  const isDemo = environment === "demo";
  const tier = data?.tier || "free";

  const isPro = ["pro", "team", "enterprise", "firm_starter", "firm_pro"].includes(tier) || isDemo;
  const isTeam = ["team", "enterprise", "firm_starter", "firm_pro"].includes(tier) || isDemo;
  const isEnterprise = ["enterprise", "firm_pro"].includes(tier) || isDemo;
  const canUseAI = isPro || isDemo;
  const hasWatermark = tier === "free" && !isDemo;

  return (
    <SubscriptionContext.Provider value={{
      data,
      isLoading,
      refetch,
      isPro,
      isTeam,
      isEnterprise,
      canUseAI,
      hasWatermark,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
}

export function getTierBadgeColor(tier: string): string {
  switch (tier) {
    case "free":
      return "bg-muted text-muted-foreground";
    case "individual":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100";
    case "pro":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100";
    case "team":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100";
    case "enterprise":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
    default:
      return "bg-muted text-muted-foreground";
  }
}
