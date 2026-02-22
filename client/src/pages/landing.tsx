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
  Sparkles,
  Download,
  Monitor
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function LandingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { canInstall, promptInstall, isInstalled } = usePWAInstall();
  const { toast } = useToast();

  // If already logged in, redirect to home
  useEffect(() => {
    if (user) {
      setLocation("/home");
    }
  }, [user, setLocation]);

  const handleInstallApp = async () => {
    const installed = await promptInstall();
    if (installed) {
      toast({
        title: "App installed successfully!",
        description: "You can now use Divorce Ledger AI from your desktop.",
      });
    } else {
      toast({
        title: "Installation cancelled",
        description: "You can install the app anytime from your browser menu.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container max-w-7xl mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">Divorce Ledger AI</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {canInstall && !isInstalled && (
              <Button variant="outline" size="sm" onClick={handleInstallApp}>
                <Download className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Install App</span>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href="/login">
                Login
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-20 lg:py-24">
        <div className="max-w-4xl mx-auto text-center space-y-4 md:space-y-6">
          <Badge variant="secondary" className="mb-2">
            <Sparkles className="h-3 w-3 mr-1" />
            Purpose-Built for Family Law Firms
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            Turn Chaos Into
            <span className="block text-primary mt-2">Court-Ready Stories</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
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
            {canInstall && !isInstalled ? (
              <Button size="lg" variant="outline" onClick={handleInstallApp} className="text-lg">
                <Download className="mr-2 h-5 w-5" />
                Install Desktop App
              </Button>
            ) : (
              <>
                <Button size="lg" variant="outline" asChild className="text-lg">
                  <Link href="/pricing">
                    View Pricing
                  </Link>
                </Button>
                <Button size="lg" variant="ghost" asChild className="text-lg">
                  <Link href="/demo-presentation">
                    Watch Demo Tour
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Value Props for Law Firms */}
      <section className="w-full bg-muted/30 py-12 md:py-16">
        <div className="container max-w-7xl mx-auto px-4 md:px-6">
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
      <section className="container max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="w-full">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              One Workspace, Everything Organized
            </h2>
            <p className="text-lg text-muted-foreground">
              Every matter gets a single ledger for incidents, finances, evidence, and communication.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-6 md:gap-8">
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

      {/* Desktop App Section */}
      {canInstall && !isInstalled && (
        <section className="container max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-blue-500/5">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Monitor className="h-10 w-10 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl md:text-3xl">Install as Desktop App</CardTitle>
              <CardDescription className="text-base max-w-2xl mx-auto mt-2">
                Get the full desktop experience with offline access, faster performance, and native app features.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
                <div className="text-center space-y-2">
                  <div className="flex justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="font-semibold">Works Offline</h3>
                  <p className="text-sm text-muted-foreground">Access your data even without internet</p>
                </div>
                <div className="text-center space-y-2">
                  <div className="flex justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="font-semibold">Faster Performance</h3>
                  <p className="text-sm text-muted-foreground">Native app speed and responsiveness</p>
                </div>
                <div className="text-center space-y-2">
                  <div className="flex justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="font-semibold">Desktop Integration</h3>
                  <p className="text-sm text-muted-foreground">Launch from your desktop or taskbar</p>
                </div>
              </div>
              <div className="flex justify-center pt-2">
                <Button size="lg" onClick={handleInstallApp} className="text-lg">
                  <Download className="mr-2 h-5 w-5" />
                  Install Desktop App Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* CTA Section */}
      <section className="w-full bg-muted/30 py-12 md:py-16">
        <div className="container max-w-7xl mx-auto px-4 md:px-6">
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
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 md:py-8">
        <div className="container max-w-7xl mx-auto px-4 md:px-6">
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
