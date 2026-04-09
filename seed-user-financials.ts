import { db } from './server/db';
import { assets, debts, incomes } from './shared/schema';
import { eq, and } from 'drizzle-orm';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';
// Seed both environments: 'live' (schema type) and 'live-prod' (bootstrap legacy value)
const ENVIRONMENTS = ['live', 'live-prod'];

async function seedForEnv(ENV: string) {
  console.log(`\n=== Seeding for environment: ${ENV} ===`);

  // Clear existing
  await db.delete(assets).where(and(eq(assets.userId, USER_ID), eq(assets.environment, ENV)));
  await db.delete(debts).where(and(eq(debts.userId, USER_ID), eq(debts.environment, ENV)));
  await db.delete(incomes).where(and(eq(incomes.userId, USER_ID), eq(incomes.environment, ENV)));

  // ─── ASSETS ──────────────────────────────────────────────────────────────
  const assetRows = [
    { name: 'Primary Residence — Marital Home',  category: 'real_estate',  value: 325000, ownership: 'marital' as const },
    { name: 'Joint Checking Account (Chase)',     category: 'bank_account', value: 18450,  ownership: 'marital' as const },
    { name: 'Joint Savings Account (Chase)',      category: 'bank_account', value: 42800,  ownership: 'marital' as const },
    { name: 'Retirement 401(k) — Fidelity',      category: 'retirement',   value: 187500, ownership: 'marital' as const },
    { name: 'Vehicle — 2021 Honda CR-V',          category: 'vehicle',      value: 24000,  ownership: 'marital' as const },
    { name: 'Personal Checking Account',          category: 'bank_account', value: 6200,   ownership: 'yours' as const },
  ] as const;

  for (const a of assetRows) {
    await db.insert(assets).values({ userId: USER_ID, environment: ENV, name: a.name, category: a.category, value: String(a.value), ownership: a.ownership } as any);
    console.log(` + Asset: ${a.name} — $${a.value.toLocaleString()}`);
  }

  // ─── DEBTS ───────────────────────────────────────────────────────────────
  const debtRows = [
    { name: 'Chase Mortgage',          category: 'mortgage',     amount: 218000, monthlyPayment: 1875 },
    { name: 'Chase Credit Card',       category: 'credit_card',  amount: 8400,   monthlyPayment: 250  },
    { name: 'Honda Auto Loan',         category: 'auto_loan',    amount: 14200,  monthlyPayment: 385  },
    { name: 'Student Loans (Navient)', category: 'student_loan', amount: 22500,  monthlyPayment: 280  },
  ];

  for (const d of debtRows) {
    await db.insert(debts).values({ userId: USER_ID, environment: ENV, name: d.name, category: d.category, amount: String(d.amount), monthlyPayment: String(d.monthlyPayment), ownership: 'marital' } as any);
    console.log(` + Debt: ${d.name} — $${d.amount.toLocaleString()} ($${d.monthlyPayment}/mo)`);
  }

  // ─── INCOMES ─────────────────────────────────────────────────────────────
  const incomeRows = [
    { source: 'Salary — Primary Employment', amount: 6250,  frequency: 'monthly', owner: 'you' },
    { source: 'Freelance / Side Income',     amount: 850,   frequency: 'monthly', owner: 'you' },
    { source: "Spouse's Reported Income",    amount: 4800,  frequency: 'monthly', owner: 'spouse' },
  ];

  for (const i of incomeRows) {
    await db.insert(incomes).values({ userId: USER_ID, environment: ENV, source: i.source, amount: String(i.amount), frequency: i.frequency, owner: i.owner } as any);
    console.log(` + Income: ${i.source} — $${i.amount}/mo`);
  }
}

(async () => {
  console.log('\n=== Seeding financial data for nedpearson@gmail.com ===');
  console.log(`=== UserID: ${USER_ID} ===\n`);

  for (const env of ENVIRONMENTS) {
    await seedForEnv(env);
  }

  const ta = 325000 + 18450 + 42800 + 187500 + 24000 + 6200;
  const td = 218000 + 8400 + 14200 + 22500;
  const yi = 6250 + 850;

  console.log('\n=== Dashboard will now show ===');
  console.log(`  Total Assets:     $${ta.toLocaleString()}`);
  console.log(`  Total Debts:      $${td.toLocaleString()}`);
  console.log(`  Monthly Income:   $${yi.toLocaleString()}/mo`);
  console.log(`  Monthly Expenses: $2,400/mo (Entergy bills)`);
  console.log(`  Net Position:     $${(ta - td).toLocaleString()}`);
  console.log('\n👉 Hard-refresh http://localhost:5000/dashboard\n');

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
