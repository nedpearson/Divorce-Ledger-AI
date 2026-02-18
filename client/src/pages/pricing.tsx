import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, X, Sparkles, Users, Building, User, Crown, Zap, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useSubscription, getTierBadgeColor } from "@/lib/subscription";
import { SUBSCRIPTION_TIERS } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const tierIcons = {
  free: User,
  individual: User,
  pro: Sparkles,
  team: Users,
  enterprise: Building,
};

const tierDescriptions = {
  free: "Perfect for exploring Divorce Ledger",
  individual: "For self-represented individuals",
  pro: "For solo practitioners and attorneys",
  team: "For small law firms (3-5 users)",
  enterprise: "For large firms with advanced needs",
};

const tierHighlights = {
  free: ["1 case", "25 violations/month", "Basic timeline view", "Watermarked PDFs"],
  individual: ["1 case", "Unlimited violations", "Clean PDF exports", "7-day email support"],
  pro: ["Unlimited cases", "Unlimited violations", "AI pattern detection", "24h email support"],
  team: ["Everything in Pro", "3-5 team members", "Priority support", "Team collaboration"],
  enterprise: ["Everything in Team", "Unlimited users", "Hidden asset detection", "API access", "Custom templates"],
};

const faqs = [
  {
    question: "Can I upgrade or downgrade my plan at any time?",
    answer: "Yes, you can change your plan at any time. When upgrading, you'll be charged the prorated difference. When downgrading, you'll receive credit toward your next billing cycle.",
  },
  {
    question: "Is my data secure?",
    answer: "Absolutely. We use AES-256 encryption for data at rest and TLS 1.3 for data in transit. All evidence files are stored with cryptographic chain of custody verification, making them court-admissible.",
  },
  {
    question: "What happens if I exceed my plan limits?",
    answer: "You'll receive a notification when approaching limits. Once reached, you can upgrade or wait until your next billing cycle. Your existing data remains safe and accessible.",
  },
  {
    question: "Can I cancel my subscription?",
    answer: "Yes, you can cancel anytime. You'll continue to have access to your current plan features until the end of your billing period. Your data is always exportable.",
  },
  {
    question: "Do you offer refunds?",
    answer: "We offer a 14-day money-back guarantee for first-time subscribers. If you're not satisfied, contact support for a full refund.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, Mastercard, American Express) and ACH bank transfers for annual enterprise plans.",
  },
];

interface StripeProduct {
  id: string;
  name: string;
  description: string;
  tier: string;
  prices: Array<{
    id: string;
    unitAmount: number;
    currency: string;
    interval: string;
  }>;
}

export default function PricingPage() {
  const { toast } = useToast();
  const { data, isLoading } = useSubscription();
  const currentTier = data?.tier || "free";
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Fetch Stripe products
  const { data: stripeData } = useQuery<{ products: StripeProduct[] }>({
    queryKey: ["/api/stripe/products"],
  });

  // Get Stripe price ID for a tier
  const getStripePriceId = (tierId: string): string | null => {
    const product = stripeData?.products?.find(p => p.tier === tierId);
    const monthlyPrice = product?.prices?.find(p => p.interval === "month");
    return monthlyPrice?.id || null;
  };

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: async ({ priceId, tier }: { priceId: string; tier: string }) => {
      const response = await apiRequest("POST", "/api/stripe/create-checkout", { priceId, tier });
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

  const handleUpgrade = (tierId: string) => {
    const priceId = getStripePriceId(tierId);
    if (!priceId) {
      toast({
        title: "Coming soon",
        description: "This plan is not yet available for purchase. Please contact support.",
      });
      return;
    }
    setCheckoutLoading(tierId);
    checkoutMutation.mutate({ priceId, tier: tierId });
  };

  const tiers = Object.entries(SUBSCRIPTION_TIERS).map(([id, info]) => ({
    id,
    ...info,
    icon: tierIcons[id as keyof typeof tierIcons],
    description: tierDescriptions[id as keyof typeof tierDescriptions],
    highlights: tierHighlights[id as keyof typeof tierHighlights],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-12">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Crown className="h-8 w-8 text-amber-500" />
          <h1 className="text-3xl font-bold" data-testid="text-pricing-title">Choose Your Plan</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Powerful forensic financial tools for divorce proceedings. Start free, upgrade when you need more.
        </p>
        {!isLoading && currentTier !== "free" && (
          <Badge className={getTierBadgeColor(currentTier)} data-testid="badge-current-plan">
            Current Plan: {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          const isCurrent = tier.id === currentTier;
          const isPopular = tier.id === "pro";
          
          return (
            <Card 
              key={tier.id} 
              className={`relative flex flex-col ${isCurrent ? "ring-2 ring-primary" : ""} ${isPopular ? "border-purple-300 dark:border-purple-700" : ""}`}
              data-testid={`card-tier-${tier.id}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-purple-600 text-white">Most Popular</Badge>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <Badge variant="outline">Current</Badge>
                </div>
              )}
              
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-2 rounded-lg ${getTierBadgeColor(tier.id)}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                </div>
                <CardDescription className="min-h-[40px]">{tier.description}</CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1">
                <div className="mb-4">
                  {tier.price === 0 ? (
                    <div className="text-3xl font-bold">Free</div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">${tier.price}</span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>
                  )}
                </div>
                
                <ul className="space-y-2 text-sm">
                  {tier.highlights.map((highlight, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              
              <CardFooter>
                {isCurrent ? (
                  <Button className="w-full" variant="outline" disabled data-testid={`button-current-${tier.id}`}>
                    Current Plan
                  </Button>
                ) : tier.price === 0 ? (
                  <Button className="w-full" variant="outline" disabled data-testid={`button-free-${tier.id}`}>
                    Free Forever
                  </Button>
                ) : (
                  <Button 
                    className="w-full" 
                    data-testid={`button-upgrade-${tier.id}`}
                    onClick={() => handleUpgrade(tier.id)}
                    disabled={checkoutLoading === tier.id}
                  >
                    {checkoutLoading === tier.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      currentTier === "free" ? "Get Started" : "Upgrade"
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Feature Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-feature-comparison">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Feature</th>
                  {tiers.map(tier => (
                    <th key={tier.id} className="text-center py-3 px-2 font-medium">
                      {tier.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 px-2">Cases</td>
                  {tiers.map(tier => (
                    <td key={tier.id} className="text-center py-3 px-2">
                      {tier.maxCases === -1 ? "Unlimited" : tier.maxCases}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2">Violations/month</td>
                  {tiers.map(tier => (
                    <td key={tier.id} className="text-center py-3 px-2">
                      {tier.maxViolationsPerMonth === -1 ? "Unlimited" : tier.maxViolationsPerMonth}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2">Team members</td>
                  {tiers.map(tier => (
                    <td key={tier.id} className="text-center py-3 px-2">
                      {tier.maxTeamMembers === -1 ? "Unlimited" : tier.maxTeamMembers}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2">Clean PDFs (no watermark)</td>
                  {tiers.map(tier => (
                    <td key={tier.id} className="text-center py-3 px-2">
                      {!tier.pdfWatermark ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2">AI Pattern Detection</td>
                  {tiers.map(tier => (
                    <td key={tier.id} className="text-center py-3 px-2">
                      {tier.aiPatternDetection ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2">Hidden Asset Detection</td>
                  {tiers.map(tier => (
                    <td key={tier.id} className="text-center py-3 px-2">
                      {tier.hiddenAssetDetection ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2">API Access</td>
                  {tiers.map(tier => (
                    <td key={tier.id} className="text-center py-3 px-2">
                      {tier.apiAccess ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-2">Custom Templates</td>
                  {tiers.map(tier => (
                    <td key={tier.id} className="text-center py-3 px-2">
                      {tier.customTemplates ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-2">Priority Support</td>
                  {tiers.map(tier => (
                    <td key={tier.id} className="text-center py-3 px-2">
                      {tier.prioritySupport ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, idx) => (
              <AccordionItem key={idx} value={`faq-${idx}`}>
                <AccordionTrigger data-testid={`accordion-faq-${idx}`}>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <div className="text-center py-8 space-y-4">
        <h2 className="text-2xl font-bold">Ready to get started?</h2>
        <p className="text-muted-foreground">
          Join thousands of legal professionals using Divorce Ledger to build stronger cases.
        </p>
        {currentTier === "free" ? (
          <Button 
            size="lg" 
            data-testid="button-get-started"
            onClick={() => handleUpgrade("pro")}
            disabled={checkoutLoading === "pro"}
          >
            {checkoutLoading === "pro" ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5 mr-2" />
            )}
            Try Pro Free for 14 Days
          </Button>
        ) : (
          <Button 
            size="lg" 
            variant="outline"
            data-testid="button-manage-subscription"
            onClick={async () => {
              try {
                const response = await apiRequest("POST", "/api/stripe/create-portal", {});
                const data = await response.json();
                if (data.url) {
                  window.location.href = data.url;
                }
              } catch (err) {
                toast({
                  title: "Error",
                  description: "Failed to open subscription management. Please try again.",
                  variant: "destructive",
                });
              }
            }}
          >
            Manage Subscription
          </Button>
        )}
      </div>
    </div>
  );
}
