import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Scale, FileText, Shield, TrendingUp, Users, Smartphone, Calendar, DollarSign } from "lucide-react";

export default function DemoPresentationPage() {
  const slides = [
    {
      id: "overview",
      label: "1. Overview",
      title: "Why Divorce Ledger AI Exists",
      icon: Scale,
      content: (
        <>
          <p className="text-sm text-muted-foreground">
            Divorce Ledger AI is built for high-conflict family law matters where evidence, money, and history
            are scattered across texts, emails, bank portals, and screenshots. It turns that chaos into
            a single, court-ready story.
          </p>
          <ul className="mt-3 space-y-1 text-sm list-disc list-inside">
            <li>Designed for law firms who want more profit with less headache.</li>
            <li>Gives clients a calmer, more guided way to participate through a simple mobile experience.</li>
            <li>Keeps everything organized for hearings, mediation, and trial—without digging through email or spreadsheets.</li>
          </ul>
        </>
      ),
    },
    {
      id: "workflow",
      label: "2. Workflow",
      title: "End-to-End Workflow at a Glance",
      icon: Users,
      content: (
        <>
          <p className="text-sm text-muted-foreground">
            A typical matter moves through Divorce Ledger AI in four stages:
          </p>
          <ol className="mt-3 space-y-1 text-sm list-decimal list-inside">
            <li><span className="font-semibold">Intake & Quick Capture:</span> client logs incidents, uploads docs, and answers structured questions.</li>
            <li><span className="font-semibold">Financial & Evidence Build:</span> assets, debts, income, expenses and violations are organized into a ledger.</li>
            <li><span className="font-semibold">Attorney Review & Strategy:</span> firm reviews timelines, patterns, and AI summaries to prepare filings.</li>
            <li><span className="font-semibold">Court-Ready Exports:</span> generate affidavits, summaries, and evidence packets directly from the data.</li>
          </ol>
        </>
      ),
    },
    {
      id: "features",
      label: "3. Core Features",
      title: "What You Get in the Workspace",
      icon: FileText,
      content: (
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <p className="font-semibold flex items-center gap-1"><FileText className="h-4 w-4" /> Cases & Violations</p>
            <p className="text-muted-foreground">Structured log of custody incidents, financial hiding, and order violations with dates, locations, and evidence.</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Financial Ledger</p>
            <p className="text-muted-foreground">Assets, debts, incomes, and expenses in one place for support, division, and negotiation.</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold flex items-center gap-1"><Shield className="h-4 w-4" /> Documents & Evidence</p>
            <p className="text-muted-foreground">Bank statements, paystubs, screenshots, and orders with AI classification and summaries.</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold flex items-center gap-1"><Users className="h-4 w-4" /> Secure Messaging</p>
            <p className="text-muted-foreground">Client–firm chat tied to matters so nothing is lost in email, and history is defensible.</p>
          </div>
        </div>
      ),
    },
    {
      id: "mobile",
      label: "4. Mobile Capture",
      title: "How Clients Use the Mobile Experience",
      icon: Smartphone,
      content: (
        <>
          <p className="text-sm text-muted-foreground">
            Clients scan a QR code from the desktop or tap a link—no passwords to remember or apps to hunt for:
          </p>
          <ul className="mt-3 space-y-1 text-sm list-disc list-inside">
            <li>One-tap access into a clean, simple incident form, built for non-technical clients.</li>
            <li>Upload photos, screenshots, and documents directly from their phone in a few taps.</li>
            <li>Install the app as a PWA so it lives on their home screen like a native app.</li>
            <li>No complex menus—just "log an incident", "add a document", and you're done.</li>
          </ul>
          <Card className="mt-4 border-dashed">
            <CardContent className="py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why it feels simple for clients</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The mobile view is stripped down to only the essentials, so even stressed, non-technical clients can capture what happened in seconds and get back to their day.
              </p>
            </CardContent>
          </Card>
        </>
      ),
    },
    {
      id: "firm-view",
      label: "5. Firm View",
      title: "What the Firm Sees",
      icon: Calendar,
      content: (
        <>
          <p className="text-sm text-muted-foreground">
            From the firm side, every matter is organized into a single command center:
          </p>
          <ul className="mt-3 space-y-1 text-sm list-disc list-inside">
            <li>Clear, at-a-glance timeline of violations and events ready for attorney review.</li>
            <li>Financial summaries, assets, debts, and support tracking in one simple view.</li>
            <li>Calendar of hearings, mediation, and deadlines tied directly to the ledger.</li>
            <li>Documents and AI summaries searchable across the matter so nothing is buried in email.</li>
          </ul>
        </>
      ),
    },
    {
      id: "pricing",
      label: "6. Pricing",
      title: "How Pricing Works",
      icon: DollarSign,
      content: (
        <>
          <p className="text-sm text-muted-foreground">
            Divorce Ledger AI uses simple seat- and matter-based plans with AI credits included:
          </p>
          <ul className="mt-3 space-y-1 text-sm list-disc list-inside">
            <li><span className="font-semibold">Individuals:</span> Free, Individual, and Pro plans depending on case volume.</li>
            <li><span className="font-semibold">Firms:</span> Firm Starter, Firm Pro, and Enterprise for larger teams.</li>
          </ul>
          <p className="mt-3 text-sm">
            For exact pricing details, see the <Link href="/pricing" className="text-primary underline">Pricing page</Link>.
          </p>
        </>
      ),
    },
  ];

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl md:text-2xl font-semibold">Divorce Ledger AI Demo Presentation</h1>
              <p className="text-xs md:text-sm text-muted-foreground">Self-guided overview of workflow, features, and pricing.</p>
            </div>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1 text-xs">
            <Monitor className="h-3 w-3" />
            Demo Mode
          </Badge>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle>How to Use This Page</CardTitle>
            <CardDescription>Walk through each slide top-to-bottom, or jump to the section you care about.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row gap-6">
            <div className="md:w-1/3 space-y-2">
              {slides.map((slide) => (
                <a key={slide.id} href={`#${slide.id}`} className="block">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left text-xs md:text-sm"
                  >
                    <span className="truncate">{slide.label}</span>
                  </Button>
                </a>
              ))}
            </div>
            <div className="md:flex-1 text-sm text-muted-foreground space-y-2">
              <p>
                Use this page when walking a prospect through the product, or share the link so they can explore
                without you on the call. Each slide below mirrors how you would normally talk through the platform.
              </p>
              <p>
                For a hands-on feel, log in with the demo firm admin or client accounts shown on the login page and
                click around the actual app while referencing these slides.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {slides.map((slide) => {
            const Icon = slide.icon;
            return (
              <Card key={slide.id} id={slide.id} className="scroll-mt-24">
                <CardHeader className="flex flex-row items-start gap-3">
                  <div className="mt-1">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base md:text-lg flex items-center gap-2">
                      {slide.label} <span className="font-normal">—</span> {slide.title}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>{slide.content}</CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
