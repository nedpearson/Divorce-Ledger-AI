import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Scale, 
  FileText, 
  Shield, 
  Clock, 
  TrendingUp, 
  Users,
  CheckCircle2,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function LandingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // If already logged in, redirect to home
  useEffect(() => {
    if (user) {
      setLocation("/home");
    }
  }, [user, setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">Divorce Ledger AI</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link href="/login">
                Login
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container px-4 md:px-6 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <Badge variant="secondary" className="mb-2">
            <Sparkles className="h-3 w-3 mr-1" />
            Purpose-Built for Family Law Firms
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Turn Chaos Into
            <span className="block text-primary mt-2">Court-Ready Stories</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Divorce Ledger AI helps law firms make more money with less headache, 
            while giving clients a calmer, more controlled experience in high-conflict divorces.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" asChild className="text-lg">
              <Link href="/login">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg">
              <Link href="/pricing">
                View Pricing
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Value Props for Law Firms */}
      <section className="container px-4 md:px-6 py-16 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built for Law Firm Profitability
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Reduce non-billable hours, increase leverage, and deliver a premium client experience.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-primary mb-2" />
                <CardTitle>More Profit</CardTitle>
                <CardDescription>
                  Fewer non-billable hours wasted searching for evidence. More time for legal strategy.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span className="text-sm">Less write-off on unbillable cleanup</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span className="text-sm">Better realization rates</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span className="text-sm">Higher partner leverage</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Clock className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Less Headache</CardTitle>
                <CardDescription>
                  Structured intake, organized history, and fewer fire-drills on every matter.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span className="text-sm">No more 'that email' scavenger hunts</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span className="text-sm">Easier onboarding when staff change</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span className="text-sm">Clear source of truth for every case</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Happier Clients</CardTitle>
                <CardDescription>
                  Clients feel seen, organized, and guided through one of life's hardest moments.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span className="text-sm">Structured place to log incidents</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span className="text-sm">Fewer 'what's happening?' calls</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span className="text-sm">Better retention and referrals</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="container px-4 md:px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              One Workspace, Everything Organized
            </h2>
            <p className="text-lg text-muted-foreground">
              Every matter gets a single ledger for incidents, finances, evidence, and communication.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-2">
              <CardHeader>
                <FileText className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Cases & Violations</CardTitle>
                <CardDescription>
                  Structured timeline of custody issues, financial hiding, non-compliance, and more. 
                  Patterns emerge over time instead of random one-offs.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <TrendingUp className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Financial Ledger</CardTitle>
                <CardDescription>
                  Assets, debts, income, and expenses in one place. Ready for court filings, 
                  support calculations, and settlement negotiations.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <Shield className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Evidence & Documents</CardTitle>
                <CardDescription>
                  Central hub for bank statements, paystubs, screenshots, and orders. 
                  AI classifies and extracts key details so your team can search instead of read every page.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <Users className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Secure Communication</CardTitle>
                <CardDescription>
                  Client-firm messages tied to matters and events. No more 'lost in email' risk, 
                  and a defensible record of what's been shared.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container px-4 md:px-6 py-16 bg-muted/30">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to Transform Your Practice?
          </h2>
          <p className="text-lg text-muted-foreground">
            Join forward-thinking law firms who are winning more cases with less chaos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" asChild className="text-lg">
              <Link href="/login">
                Login to Your Account
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg">
              <Link href="/signup">
                Start Free Trial
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <span className="font-semibold">Divorce Ledger AI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Divorce Ledger AI. All rights reserved.
            </p>
            <div className="flex gap-4">
              <Link href="/pricing">
                <a className="text-sm text-muted-foreground hover:text-foreground">Pricing</a>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
