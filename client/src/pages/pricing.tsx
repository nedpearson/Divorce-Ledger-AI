import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Crown, Zap, Building, User, Loader2, ArrowRight, Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Plan {
  id: string;
  name: string;
  price: number;
  aiCredits: number;
  features: string[];
  popular?: boolean;
}

const CONSUMER_PLANS: Plan[] = [
  {
    id: "consumer_free",
    name: "Free",
    price: 0,
    aiCredits: 100,
    features: [
      "1 case",
      "100 AI credits/month",
      "500MB storage",
      "Basic features",
      "Community support",
    ],
  },
  {
    id: "consumer_individual",
    name: "Individual",
    price: 12,
    aiCredits: 500,
    features: [
      "3 cases",
      "500 AI credits/month",
      "5GB storage",
      "Clean PDF exports",
      "7-day email support",
    ],
    popular: true,
  },
  {
    id: "consumer_pro",
    name: "Pro",
    price: 49,
    aiCredits: 2000,
    features: [
      "Unlimited cases",
      "2,000 AI credits/month",
      "50GB storage",
      "AI pattern detection",
      "Priority support",
    ],
  },
];

const FIRM_PLANS: Plan[] = [
  {
    id: "firm_starter",
    name: "Firm Starter",
    price: 149,
    aiCredits: 5000,
    features: [
      "3 seats",
      "25 matters",
      "5 clients/matter",
      "5,000 AI credits/month",
      "50GB storage",
      "Team collaboration",
    ],
  },
  {
    id: "firm_pro",
    name: "Firm Pro",
    price: 399,
    aiCredits: 20000,
    features: [
      "10 seats",
      "100 matters",
      "20 clients/matter",
      "20,000 AI credits/month",
      "200GB storage",
      "Priority support",
    ],
    popular: true,
  },
  {
    id: "firm_enterprise",
    name: "Firm Enterprise",
    price: 0,
    aiCredits: 100000,
    features: [
      "Unlimited seats",
      "Unlimited matters",
      "Unlimited clients",
      "100,000+ AI credits/month",
      "Unlimited storage",
      "Dedicated support",
      "API access",
    ],
  },
];

export default function PricingPage() {
  const { toast } = useToast();
  const [workspaceType, setWorkspaceType] = useState<"consumer" | "firm">("consumer");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const checkoutMutation = useMutation({
    mutationFn: async ({ planId, workspaceType }: { planId: string; workspaceType: string }) => {
      const response = await apiRequest("POST", "/api/billing/workspace/checkout", {
        planId,
        workspaceType,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Checkout failed",
        description: error.message || "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
      setCheckoutLoading(null);
    },
  });

  const handleUpgrade = (planId: string) => {
    if (planId === "consumer_free") {
      toast({
        title: "Already on Free Plan",
        description: "You're already using the free plan.",
      });
      return;
    }
    if (planId === "firm_enterprise") {
      toast({
        title: "Contact Sales",
        description: "Please contact our sales team for Enterprise pricing.",
      });
      return;
    }
    setCheckoutLoading(planId);
    checkoutMutation.mutate({ planId, workspaceType });
  };

  const plans = workspaceType === "consumer" ? CONSUMER_PLANS : FIRM_PLANS;

  return (
    <div className="min-h-screen w-full">
    <div className="container max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
      <div className="text-center space-y-3 md:space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Crown className="h-6 w-6 md:h-8 md:w-8 text-amber-500" />
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">Choose Your Plan</h1>
        </div>
        <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto px-4">
          Powerful forensic financial tools for divorce proceedings. AI-powered analysis with flexible credit-based pricing.
        </p>
      </div>

      <div className="flex justify-center">
        <Tabs
          value={workspaceType}
          onValueChange={(v) => setWorkspaceType(v as "consumer" | "firm")}
          className="w-full max-w-md"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="consumer" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Individual
            </TabsTrigger>
            <TabsTrigger value="firm" className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              Law Firm
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {plans.map((plan) => {
          const isFree = plan.price === 0 && plan.id === "consumer_free";
          const isEnterprise = plan.id === "firm_enterprise";

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${
                plan.popular ? "ring-2 ring-purple-500 border-purple-300 dark:border-purple-700" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-purple-600 text-white">Most Popular</Badge>
                </div>
              )}

              <CardHeader className="pb-4">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription className="min-h-[40px]">{plan.name} plan</CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-6">
                <div>
                  {isFree ? (
                    <div className="text-4xl font-bold">Free</div>
                  ) : isEnterprise ? (
                    <div className="text-4xl font-bold">Custom</div>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold">${plan.price}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                  <Coins className="h-4 w-4 text-blue-600" />
                  <span className="font-semibold">{plan.aiCredits.toLocaleString()} AI Credits/month</span>
                </div>

                <ul className="space-y-3 text-sm">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                {isFree ? (
                  <Button className="w-full" variant="outline" disabled>
                    Current Plan
                  </Button>
                ) : isEnterprise ? (
                  <Button
                    className="w-full"
                    onClick={() => window.open("mailto:sales@divorceledger.ai", "_blank")}
                  >
                    Contact Sales
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={checkoutLoading === plan.id}
                  >
                    {checkoutLoading === plan.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Get Started
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <CardTitle>AI Credits Explained</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">
            AI Credits power intelligent features like document analysis, pattern detection, and voice transcription.
            Here's what typical operations cost:
          </p>
          <ul className="grid md:grid-cols-2 gap-2 text-sm">
            <li>• Document Classification: <strong>10 credits</strong></li>
            <li>• Document Parsing: <strong>25 credits</strong></li>
            <li>• Voice Transcription: <strong>5 credits/minute</strong></li>
            <li>• Image Analysis: <strong>20 credits</strong></li>
            <li>• Case Builder Assistant: <strong>50 credits</strong></li>
            <li>• Court Filing Review: <strong>75 credits</strong></li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Credits reset monthly. Need more? Choose <strong>METERED</strong> mode to automatically purchase
            overages at $0.10 per 10 credits.
          </p>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
