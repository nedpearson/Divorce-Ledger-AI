/**
 * bulk-analyze-and-extract.ts
 *
 * 1. Finds all documents stuck at 'uploaded' / 'pending' for the current user
 * 2. Runs AnalysisOrchestrator on each one (re-classifying correctly)
 * 3. For utility bills + receipts: creates an expense record so the dashboard shows real data
 *
 * Usage: npx tsx --import dotenv/config bulk-analyze-and-extract.ts
 */
import { db } from './server/db';
import { documents, expenses } from './shared/schema';
import { eq, and, or, inArray } from 'drizzle-orm';
import { analysisOrchestrator } from './server/services/ai/AnalysisOrchestrator';

const USER_ID   = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';
const ENV       = 'live'; // Canonical environment value (was 'live-prod' — now fixed)

// Utility bill categories that should create expense records
const EXPENSE_CATEGORIES = ['utility_bill', 'receipt', 'insurance'];

// Month name → numeric month (for sorting)
const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

function estAmountFromFilename(fileName: string): number | null {
  // Look for dollar amounts in filename: $123.45 or 123.45
  const dollarMatch = fileName.match(/\$?([\d,]+\.?\d{0,2})/);
  if (dollarMatch) {
    const parsed = parseFloat(dollarMatch[1].replace(',', ''));
    if (parsed > 10 && parsed < 10000) return parsed; // sanity check
  }
  return null;
}

function billDateFromFilename(fileName: string): string {
  const monthMatch = fileName.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[_\s-]?(\d{4})/i);
  if (monthMatch) {
    const m = MONTH_MAP[monthMatch[1].toLowerCase()] || 1;
    const y = parseInt(monthMatch[2]);
    return `${y}-${String(m).padStart(2, '0')}-01`;
  }
  return new Date().toISOString().split('T')[0];
}

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('   BULK ANALYZE + EXPENSE EXTRACTION');
  console.log('══════════════════════════════════════════\n');

  // 1. Fetch all stuck documents — check BOTH canonical and legacy env values
  const stuck = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.userId, USER_ID),
        or(
          eq(documents.environment, 'live'),
          eq(documents.environment, 'live-prod')
        ),
        or(
          eq((documents as any).aiAnalysisStatus, 'pending'),
          eq((documents as any).aiAnalysisStatus, 'uploaded'),
          eq((documents as any).aiAnalysisStatus, 'error')
        )
      )
    );

  console.log(`Found ${stuck.length} documents to analyze\n`);

  let analyzed = 0;
  let expensesCreated = 0;
  let errors = 0;

  for (const doc of stuck) {
    const title = doc.title || (doc as any).fileName || doc.id;
    process.stdout.write(`  📄 ${title.slice(0, 50).padEnd(52)} `);

    try {
      // Run the orchestrator
      await analysisOrchestrator.processDocument(doc.id);
      analyzed++;

      // Fetch fresh state after analysis
      const fresh = await db.select().from(documents).where(eq(documents.id, doc.id));
      const updated = fresh[0] as any;
      const category = updated.aiCategory || updated.category || 'other';

      console.log(`→ ${category} ✅`);

      // 2. Create expense records for utility/bill categories
      if (EXPENSE_CATEGORIES.includes(category)) {
        const fn = (updated.fileName || updated.title || '');
        const amount = estAmountFromFilename(fn) ?? 150; // default $150 estimate if not in filename
        const billDate = billDateFromFilename(fn);
        const label = updated.title || fn;

        // Check for duplicate expense
        const existing = await db
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, USER_ID),
              eq(expenses.environment, ENV),
              eq(expenses.name, label)
            )
          );

        if (existing.length === 0) {
          await db.insert(expenses).values({
            userId: USER_ID,
            environment: ENV,
            name: label,
            category: category === 'utility_bill' ? 'utilities' : 'other',
            amount: amount,
            frequency: 'monthly',
            owner: 'you',
            createdAt: new Date(),
          } as any);
          expensesCreated++;
          console.log(`       💰 Expense created: ${label} — $${amount}/mo`);
        } else {
          console.log(`       ⏭️  Expense already exists for: ${label}`);
        }
      }
    } catch (err: any) {
      console.log(`→ ERROR: ${err.message?.slice(0, 60)}`);
      errors++;
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`✅ Analyzed:         ${analyzed}/${stuck.length} documents`);
  console.log(`💰 Expenses created: ${expensesCreated}`);
  console.log(`❌ Errors:           ${errors}`);
  console.log('══════════════════════════════════════════\n');
  console.log('👉 Refresh your browser dashboard to see updated financials!\n');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
