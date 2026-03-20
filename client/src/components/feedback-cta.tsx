import { Link } from 'wouter';
import { Lightbulb } from 'lucide-react';

export function FeedbackCTA() {
  return (
    <Link
      href="/recommendations"
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-full transition-colors cursor-pointer"
      data-testid="link-feedback-cta"
    >
      <Lightbulb className="h-4 w-4" />
      <span>Give Advice For Improvement</span>
    </Link>
  );
}
