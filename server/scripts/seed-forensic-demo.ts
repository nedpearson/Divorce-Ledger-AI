import 'dotenv/config';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, isPasswordHashed } from '../auth';
import { randomBytes } from 'crypto';

// Cryptographically-secure random float in [0, 1)
function secureRandom(): number {
  return randomBytes(4).readUInt32BE(0) / 0x1_0000_0000;
}

// Utility chunk insert
async function chunkedInsert<T extends any>(table: any, data: T[], chunkSize = 500) {
  const inserted: T[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const res = await db.insert(table).values(chunk).returning();
    inserted.push(...(res as any[]));
  }
  return inserted;
}

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Very rich data banks
const REAL_BANKS = ['JPMorgan Chase', 'Bank of America', 'Wells Fargo', 'Citibank', 'U.S. Bank', 'PNC Bank', 'Truist', 'Goldman Sachs', 'First Republic'];
const BROKERS = ['Fidelity Investments', 'Charles Schwab', 'Vanguard', 'E*TRADE', 'TD Ameritrade', 'Robinhood', 'Morgan Stanley'];
const CC_VENDORS = ['American Express', 'Discover', 'Capital One', 'Barclays', 'Synchrony', 'Chase Sapphire'];
const MORTGAGES = ['Rocket Mortgage', 'United Wholesale', 'LoanDepot', 'PennyMac', 'Mr. Cooper', 'Quicken Loans'];

const ASSET_TYPES = [
  { c: 'bank_account', n: ['Checking Account', 'High-Yield Savings', 'Money Market', 'Joint Checking'] },
  { c: 'investment_account', n: ['Brokerage Account', 'Traditional IRA', 'Roth IRA', '401(k) Plan', 'Trust Account', 'Restricted Stock Units (RSUs)'] },
  { c: 'real_property', n: ['Primary Residence', 'Vacation Home', 'Rental Property', 'Commercial Unit', 'Land Parcel'] },
  { c: 'vehicle', n: ['Tesla Model Y', 'BMW X5', 'Porsche 911', 'Honda Odyssey', 'Sea Ray Boat', 'Airstream RV'] },
  { c: 'other_asset', n: ['Rolex Collection', 'Fine Art', 'Crypto Hardware Wallet', 'Business Equity'] }
];

const DEBT_TYPES = [
  { c: 'mortgage', n: ['Primary Mortgage 30yr Fixed', 'HELOC', 'Investment Property Loan', 'Bridge Loan'] },
  { c: 'auto_loan', n: ['Auto Loan Financing', 'Vehicle Lease', 'Lease Buyout Loan'] },
  { c: 'credit_card', n: ['Rewards Visa', 'Platinum Amex', 'Cashback Mastercard', 'Venture Card'] },
  { c: 'personal_loan', n: ['Unsecured Loan', 'Consolidation Loan', 'Family Loan Note', 'SoFi Personal Loan'] },
];

const EXPENSE_CATEGORIES = [
  { c: 'housing', v: ['Home Depot', 'Lowe\'s', 'HOA Dues', 'Property Tax', 'Landscaping Pros', 'Plumbing Repair'] },
  { c: 'utilities', v: ['PG&E', 'ConEdison', 'Xfinity', 'Verizon', 'AT&T', 'City Water', 'Waste Management'] },
  { c: 'groceries', v: ['Whole Foods', 'Trader Joe\'s', 'Kroger', 'Costco', 'Safeway', 'Instacart', 'Wegmans'] },
  { c: 'transportation', v: ['Exxon', 'Shell', 'Chevron', 'Uber', 'Lyft', 'Auto Insurance', 'FasTrak', 'Tesla Supercharger'] },
  { c: 'healthcare', v: ['CVS Pharmacy', 'Walgreens', 'Quest Diagnostics', 'Dental Copay', 'UCLA Medical', 'Therapy Session'] },
  { c: 'childcare', v: ['Bright Horizons', 'KinderCare', 'Local Nanny Services', 'Tutor.com', 'Summer Camp Registration', 'Violin Lessons'] },
  { c: 'legal_professional', v: ['Law Office Retainer', 'Forensic CPA Fee', 'Mediator Invoice', 'Process Server'] }
];

const INCOME_SOURCES = [
  { c: 'salary_wages', n: ['Bi-weekly Payroll', 'Direct Deposit Employer', 'Salary', 'Executive Compensation'] },
  { c: 'bonus_commission', n: ['Q3 Bonus', 'Annual Performance Bonus', 'Sales Commission', 'Signing Bonus'] },
  { c: 'investment_income', n: ['Dividend Distribution', 'Capital Gains', 'Interest Payment', 'Bond Yield'] },
  { c: 'rental_income', n: ['Tenant Rent - 104 Main St', 'Airbnb Payout', 'Commercial Lease - Unit 4'] },
];

const TX_VENDORS = ['Target', 'Walmart', 'Amazon', 'Starbucks', 'Delta Airlines', 'Marriott', 'Apple Store', 'Best Buy', 'Netflix', 'Spotify', 'Peloton', 'Equinox', 'Uber Eats', 'Doordash', 'Sephora', 'Lululemon', 'Golf Club Dues', 'Dry Cleaning'];
const SUSPICIOUS_TX = [
  { desc: 'Transfer to external unverified account', cat: 'miscellaneous', vend: 'Wire Transfer' },
  { desc: 'Large cash withdrawal at casino ATM', cat: 'needs_review', vend: 'ATM Withdrawal' },
  { desc: 'Crypto exchange purchase', cat: 'needs_review', vend: 'Coinbase' },
  { desc: 'Offshore wire payment', cat: 'miscellaneous', vend: 'International Wire' },
  { desc: 'Payment to known forensic subject', cat: 'legal_professional', vend: 'Private Investigator' },
  { desc: 'High-value jewelry purchase', cat: 'miscellaneous', vend: 'Tiffany & Co.' },
  { desc: 'Unexplained business expense', cat: 'needs_review', vend: 'Consulting Group LLC' }
];

const DOC_TITLES = ['Tax Return 2023', 'W2 Final', 'Custody Agreement Draft', 'Title Deed', 'Investment Summary', 'Property Appraisal', 'Prenuptial Agreement', 'Child Support Worksheet', 'Deposition Transcript', 'Discovery Responses', 'Bank Statement Dec', 'Credit Card Statement YTD', 'Mortgage Closing Disclosure', 'Business K-1', 'Crypto Ledger Export'];
const DOC_CATEGORIES = ['bank_statement', 'tax_return', 'court_order', 'property_deed', 'financial_statement', 'correspondence', 'other', 'evidence_photo', 'legal_filing', 'asset_valuation'];

const VIOLATION_SCENARIOS = [
  {
    type: 'financial_hiding',
    desc: 'Spouse transferred $45,000 from joint savings to an undisclosed offshore or crypto account without notification.',
    sev: 'critical', notes: 'Extracted from missing ledger entries on June 14th.',
    aiMatch: 'High probability of asset dissipation based on wire patterns.'
  },
  {
    type: 'property_damage',
    desc: 'Deliberate damage to shared marital vehicle (broken windows) resulting in a $3,200 repair bill.',
    sev: 'high', notes: 'Police report filed on scene.',
    aiMatch: 'Correlates with hostile SMS exchange occurring 2 hours prior.'
  },
  {
    type: 'communication',
    desc: 'Sent 42 hostile harassment text messages between 2 AM and 4 AM threatening financial ruin.',
    sev: 'medium', notes: 'Exported from cellular carrier logs.',
    aiMatch: 'Sentiment analysis detected severe aggression and intimidation tactics.'
  },
  {
    type: 'court_order',
    desc: 'Failed to return children at the court-mandated 5:00 PM Sunday exchange. Arrived 4 hours late.',
    sev: 'high', notes: 'Third occurance this month.',
    aiMatch: 'Geofence timeline contradicts subject\'s stated alibi.'
  },
  {
    type: 'financial_hiding',
    desc: 'Purchased luxury watch for $18,000 using corporate funds and attempted to write it off as an office expense.',
    sev: 'critical', notes: 'Audited from QuickBooks Ledger sync.',
    aiMatch: 'Vendor category mismatch detected. Rolex Boutique classified as "Office Supplies".'
  },
  {
    type: 'child_support',
    desc: 'Missed court-ordered temporary support payment of $2,500 due on the 1st of the month.',
    sev: 'high', notes: 'Arrears accumulating.',
    aiMatch: 'Bank ledger confirms absence of expected incoming transfer.'
  }
];

export interface CaseProfile {
  name: string;
  email: string;
  opposingName: string;
  opposingEmail: string;
  caseTitle: string;
  assetCount: number;
  debtCount: number;
  incomeCount: number;
  expenseCount: number;
  documentCount: number;
  transactionCount: number;
  violationCount: number;
  messageCount: number;
  eventCount: number;
  alertCount: number;
  assetMultiplier: number;
  suspicionRate: number;
  hostileMsgRate: number;
  businessFocus: boolean;
  custodyFocus: boolean;
}

export async function seedProfile(profile: CaseProfile, hashedPass: string, env: string) {
  let clientUser = await db.query.users.findFirst({ where: eq(schema.users.email, profile.email) });
  if (!clientUser) {
    const inserted = await db.insert(schema.users).values({
      email: profile.email,
      password: hashedPass,
      fullName: profile.name,
      role: 'client',
      isAdmin: false,
      status: 'active',
      environment: env,
      subscriptionTier: 'pro',
      casesCount: 1,
      createdAt: new Date(),
    }).returning();
    clientUser = inserted[0];
  } else if (!isPasswordHashed(clientUser.password)) {
    await db.update(schema.users).set({ password: hashedPass }).where(eq(schema.users.id, clientUser.id));
  }
  const clientId = clientUser.id;

  let opposingUser = await db.query.users.findFirst({ where: eq(schema.users.email, profile.opposingEmail) });
  if (!opposingUser) {
    const inserted = await db.insert(schema.users).values({
      email: profile.opposingEmail,
      password: hashedPass,
      fullName: profile.opposingName,
      role: 'client',
      isAdmin: false,
      status: 'active',
      environment: env,
      subscriptionTier: 'free',
      casesCount: 0,
      createdAt: new Date(),
    }).returning();
    opposingUser = inserted[0];
  } else if (!isPasswordHashed(opposingUser.password)) {
    await db.update(schema.users).set({ password: hashedPass }).where(eq(schema.users.id, opposingUser.id));
  }
  const opposingId = opposingUser.id;

  // Support Multi-Tenant architecture
  const [workspace] = await db.insert(schema.workspaces).values({
    name: `${profile.name} Workspace`,
    type: 'personal',
    ownerId: clientId,
    subscriptionTier: 'pro',
    subscriptionStatus: 'active',
  } as any).returning();

  await db.insert(schema.workspaceMembers).values({
    workspaceId: workspace.id,
    userId: clientId,
    role: 'owner',
  } as any);

  const [matter] = await db.insert(schema.matters).values({
    workspaceId: workspace.id,
    matterNumber: `MAT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    title: profile.caseTitle,
    status: 'active',
    leadAttorneyId: clientId, // Optional fallback
  } as any).returning();

  await db.insert(schema.matterMembers).values([
    {
      matterId: matter.id,
      userId: clientId,
      role: 'client',
      permissions: { can_view: true, can_upload: true, can_comment: true },
    } as any,
    {
      matterId: matter.id,
      userId: opposingId,
      role: 'opposing_party',
      permissions: { can_view: false, can_upload: false, can_comment: false },
    } as any,
  ]);

  await db.insert(schema.cases).values({
    userId: clientId,
    title: profile.caseTitle,
    caseNumber: `FAM-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
    court: 'Superior Court - Family Division',
    opposingParty: profile.opposingName,
    status: 'active',
    environment: env
  });

  const today = new Date();
  const threeYearsAgo = new Date(today.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

  const assets: any[] = [];
  for (let i = 0; i < profile.assetCount; i++) {
    const t = pick(ASSET_TYPES);
    const n = pick(t.n);
    const vendor = t.c === 'bank_account' ? pick(REAL_BANKS) : 
                   t.c === 'investment_account' ? pick(BROKERS) : 
                   t.c === 'real_property' ? 'County Assessor' : 
                   t.c === 'vehicle' ? 'DMV' : 'Appraiser';
    assets.push({
      userId: clientId,
      name: `${vendor} ${n} (*${Math.floor(1000 + Math.random() * 9000)})`,
      category: t.c,
      value: Math.min(2000000000, Math.floor((Math.floor(Math.random() * (t.c === 'real_property' ? 200000000 : 50000000)) + 50000) * profile.assetMultiplier)),
      ownership: ['joint', 'you', 'spouse'][Math.floor(Math.random() * 3)],
      vendor: vendor,
      verified: Math.random() > 0.3,
      acquiredDate: randomDate(threeYearsAgo, ninetyDaysAgo).toISOString().split('T')[0],
      environment: env
    });
  }
  if (assets.length) await chunkedInsert(schema.assets, assets);

  const debts: any[] = [];
  for (let i = 0; i < profile.debtCount; i++) {
    const t = pick(DEBT_TYPES);
    const n = pick(t.n);
    const vendor = t.c === 'mortgage' ? pick(MORTGAGES) : 
                   t.c === 'credit_card' ? pick(CC_VENDORS) : 
                   t.c === 'auto_loan' ? pick(REAL_BANKS) : pick(REAL_BANKS);
    debts.push({
      userId: clientId,
      name: `${n} (*${Math.floor(1000 + Math.random() * 9000)})`,
      category: t.c,
      amount: Math.floor(Math.random() * (t.c === 'mortgage' ? 100000000 : 5000000)) + 50000,
      monthlyPayment: Math.floor(Math.random() * 50000) + 10000,
      ownership: ['joint', 'you', 'spouse'][Math.floor(Math.random() * 3)],
      vendor: vendor,
      environment: env
    });
  }
  if (debts.length) await chunkedInsert(schema.debts, debts);

  const incomes: any[] = [];
  for (let i = 0; i < profile.incomeCount; i++) {
    const t = pick(INCOME_SOURCES);
    incomes.push({
      userId: clientId,
      source: profile.businessFocus && t.c === 'investment_income' ? `K-1 Distro - Entity ${i}` : pick(t.n),
      category: t.c,
      amount: Math.min(2000000000, Math.floor((Math.floor(Math.random() * 1500000) + 200000) * profile.assetMultiplier)),
      frequency: ['monthly', 'bi_weekly', 'annual', 'one_time'][Math.floor(Math.random() * 4)],
      owner: ['you', 'spouse'][Math.floor(Math.random() * 2)],
      verified: Math.random() > 0.2,
      environment: env
    });
  }
  if (incomes.length) await chunkedInsert(schema.incomes, incomes);

  const expenses: any[] = [];
  for (let i = 0; i < profile.expenseCount; i++) {
    const t = profile.custodyFocus && Math.random() > 0.5 ? EXPENSE_CATEGORIES.find(e => e.c === 'childcare')! : pick(EXPENSE_CATEGORIES);
    const vend = pick(t.v);
    expenses.push({
      userId: clientId,
      description: `Recurring ${vend} Bill`,
      category: t.c,
      amount: Math.floor(Math.random() * (t.c === 'housing' || t.c === 'childcare' ? 200000 : 50000)) + 5000,
      frequency: ['monthly', 'annual', 'weekly'][Math.floor(Math.random() * 3)],
      owner: ['joint', 'you', 'spouse'][Math.floor(Math.random() * 3)],
      vendor: vend,
      environment: env
    });
  }
  if (expenses.length) await chunkedInsert(schema.expenses, expenses);

  const documents: any[] = [];
  const addDoc = (title: string, category: string, fileType: string, isAnalyzed: boolean, summary: string, hasError: boolean = false) => {
      const dDate = new Date(today.getTime() - Math.floor(Math.random() * 300) * 24 * 60 * 60 * 1000);
      let status = isAnalyzed ? 'complete' : (hasError ? 'failed' : 'pending');
      if (!isAnalyzed && Math.random() > 0.5 && !hasError) status = 'review';
      
      documents.push({
        userId: clientId,
        title,
        description: `Source file for ${title}. Content has been ingested for discovery mapping.`,
        category,
        isConfidential: category === 'medical' || category === 'legal',
        fileType,
        fileSize: Math.floor(Math.random() * 5000000) + 120000,
        fileName: `${title.replace(/\s+/g, '_').toLowerCase()}.pdf`,
        fileUrl: `https://storage.example.com/demo/secure_doc_${Math.floor(Math.random()*10000)}.pdf`,
        aiAnalysisStatus: status,
        aiSummary: isAnalyzed ? `AI Summary: ${summary}` : null,
        aiConfidence: isAnalyzed ? 0.85 + (Math.random() * 0.14) : null,
        aiAnalyzedAt: isAnalyzed ? new Date() : null,
        aiSuggestedTags: isAnalyzed ? [category, 'verified', '2023'] : [],
        aiExtractedText: isAnalyzed ? `Extracted OCR text matching ${summary}` : null,
        createdAt: dDate,
        updatedAt: dDate,
        environment: env
      });
  };

  addDoc('Motion for Temporary Orders', 'legal', 'application/pdf', true, 'Motion filed requesting temporary custody and exclusive use of the marital residence.');
  addDoc('Subpoena Duces Tecum - Bank Statements', 'legal', 'application/pdf', true, 'Subpoena demanding production of all JPMorgan Chase records from 2020-2023.');
  addDoc('First Set of Interrogatories', 'legal', 'application/pdf', false, '');
  addDoc('Summons and Petition for Dissolution', 'legal', 'application/pdf', true, 'Initial divorce filing establishing jurisdiction and requesting property division.');

  addDoc('PG&E Utility Bill - Aug 2023', 'receipt', 'application/pdf', true, 'Utility bill for primary residence showing total amount due $345.12.');
  addDoc('Trader Joe\'s Grocery Receipt', 'receipt', 'image/jpeg', false, ''); 
  addDoc('Comcast Internet Statement', 'receipt', 'application/pdf', true, 'Monthly internet bill for $110.00 auto-paid via Chase checking.');
  addDoc('Target Home Goods Receipt', 'receipt', 'image/jpeg', false, '', true); 
  addDoc('State Farm Homeowners Insurance', 'financial', 'application/pdf', true, 'Annual premium statement for marital home insurance policy.');

  for (let i = 0; i < Math.max(0, profile.documentCount - 9); i++) {
     addDoc(`Financial Disclosure Exhibit ${String.fromCharCode(65+i)}`, 'financial', 'application/pdf', Math.random() > 0.3, 'Financial exhibit attached to disclosure packet.');
  }
  const insertedDocs = documents.length ? await chunkedInsert(schema.documents, documents) : [];
  const docIds = insertedDocs.map(d => d.id);

  if (profile.custodyFocus || profile.businessFocus) {
    const w2s = [];
    w2s.push({
      userId: clientId, party: 'self', taxYear: 2023, employerName: 'Demo Corp LLC', wagesAndTips: 14500000, federalWithheld: 3200000, environment: env
    });
    w2s.push({
      userId: clientId, party: 'spouse', taxYear: 2023, employerName: 'Standard Tech Inc', wagesAndTips: 18500000, federalWithheld: 4500000, environment: env
    });
    await chunkedInsert(schema.w2Records, w2s);

    const reimbursements = [];
    reimbursements.push({
      userId: clientId, category: 'medical_record', description: 'Orthodontics braces copay', amount: 350000, owedBy: profile.opposingName, status: 'pending', dueDate: new Date(), environment: env
    });
    reimbursements.push({
      userId: clientId, category: 'education', description: 'Private school tuition deposit', amount: 750000, owedBy: 'Joint', status: 'disputed', dueDate: new Date(), environment: env
    });
    await chunkedInsert(schema.reimbursements, reimbursements);
    
    if (profile.custodyFocus) {
        const csPayments = [];
        for (let j = 0; j < 6; j++) {
            const dueDate = new Date(today.getTime() - (j * 30 * 24 * 60 * 60 * 1000));
            const isPaid = j > 1; // latest two might be unpaid
            csPayments.push({
                userId: clientId,
                paymentType: 'child_support',
                amount: 150000, 
                dueDate: dueDate,
                paidDate: isPaid ? new Date(dueDate.getTime() + 86400000) : null,
                status: isPaid ? 'completed' : 'pending',
                childName: 'Emma Reynolds',
                environment: env
            });
        }
        await chunkedInsert(schema.childSupportPayments, csPayments);
    }
  }

  const transactions: any[] = [];
  for (let i = 0; i < profile.transactionCount; i++) {
    const isSuspicious = Math.random() < profile.suspicionRate;
    const t = isSuspicious ? pick(SUSPICIOUS_TX) : { vend: pick(TX_VENDORS), cat: pick(EXPENSE_CATEGORIES).c, desc: 'Standard point of sale transaction' };
    
    let amount = Math.floor(Math.random() * 50000) + 500;
    if (isSuspicious) amount = Math.floor(Math.random() * 800000) + 50000;
    if (i % 83 === 0) amount = 1950000;

    transactions.push({
      userId: clientId,
      date: randomDate(threeYearsAgo, today).toISOString().split('T')[0],
      description: `${t.vend} - ${t.desc}`,
      amount: Math.min(2000000000, Math.floor(amount * profile.assetMultiplier)),
      category: t.cat,
      type: Math.random() > 0.2 || isSuspicious ? 'expense' : 'income',
      vendor: t.vend,
      documentId: (docIds.length && Math.random() > 0.8) ? pick(docIds) : null,
      environment: env
    });
  }
  if (transactions.length) await chunkedInsert(schema.transactions, transactions);

  const violations: any[] = [];
  for (let i = 0; i < profile.violationCount; i++) {
    const v = pick(VIOLATION_SCENARIOS);
    const isResolved = Math.random() > 0.7;
    const vDate = randomDate(ninetyDaysAgo, today);
    violations.push({
      userId: clientId,
      type: v.type,
      description: v.desc,
      status: isResolved ? 'resolved' : 'pending',
      severity: v.sev,
      aiClassification: v.type,
      aiConfidenceScore: 0.88 + Math.random() * 0.1,
      voiceNotes: v.notes,
      aiExtractedText: v.aiMatch,
      createdAt: vDate,
      updatedAt: vDate,
      environment: env
    });
  }
  const insertedViolations = violations.length ? await chunkedInsert(schema.violations, violations) : [];
  
  const evidences: any[] = [];
  for (let i = 0; i < insertedViolations.length; i++) {
    const v = insertedViolations[i];
    const eCount = Math.floor(Math.random() * 3) + 1;
    for (let e = 0; e < eCount; e++) {
      evidences.push({
        violationId: v.id,
        userId: clientId,
        fileName: `EvidenceAudit_${v.id.substring(0,6)}_${e}.png`,
        objectPath: `/demo/secure/Evidence_${v.id}_${e}.png`,
        fileType: 'image/png',
        fileSize: 1024 * (Math.floor(Math.random() * 5000) + 500),
        uploadedAt: new Date(new Date(v.createdAt).getTime() + 3600),
        environment: env,
        gpsLatitude: (34.0522 + secureRandom() * 0.1).toString(),
        gpsLongitude: (-118.2437 + secureRandom() * 0.1).toString(),
      });
    }
  }
  if (evidences.length) await chunkedInsert(schema.evidenceFiles, evidences);
  
  const messages: any[] = [];
  const msgSubjects = ['Settlement Offer', 'Custody Schedule Next Week', 'Refinance Documents', 'Missing Forms', 'Mediation Date'];
  for(let i = 0; i < profile.messageCount; i++) {
    const isHostile = Math.random() < profile.hostileMsgRate;
    messages.push({
      senderId: Math.random() > 0.5 ? clientId : opposingId,
      senderRole: Math.random() > 0.5 ? 'client' : 'opposing_party',
      senderName: Math.random() > 0.5 ? profile.name : profile.opposingName,
      content: isHostile 
          ? `I'm not agreeing to anything you proposed. If you think you're getting the house, you're delusional. I'll drag this out for years.` 
          : `Please see the attached ${pick(msgSubjects).toLowerCase()} for your review prior to our next check-in.`,
      timestamp: randomDate(ninetyDaysAgo, today),
      environment: env
    });
  }
  if (messages.length) await chunkedInsert(schema.messages, messages);
  
  const events: any[] = [];
  for(let i = 0; i < profile.eventCount; i++) {
    const start = randomDate(threeYearsAgo, new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000));
    const titleBase = pick(['Hearing - Dept 42', 'Mediation Session', 'Filing Deadline: Discovery', 'Custody Exchange (Library)', 'Deposition']);
    events.push({
      userId: clientId,
      title: titleBase,
      eventType: titleBase.includes('Hear') ? 'hearing' : titleBase.includes('Exch') ? 'custody' : 'deadline',
      startDate: start,
      endDate: new Date(start.getTime() + (Math.floor(Math.random()*4)+1) * 3600000),
      location: titleBase.includes('Dept 42') ? 'Superior Court' : 'Zoom Video',
      status: start > today ? 'scheduled' : 'completed',
      environment: env
    });
  }
  if (events.length) await chunkedInsert(schema.calendarEvents, events);

  const alerts: any[] = [];
  for(let i = 0; i < profile.alertCount; i++) {
    const isUnread = Math.random() > 0.4;
    alerts.push({
      userId: clientId,
      title: `AI Guard: ${profile.custodyFocus ? 'Geofence Breach Detected' : pick(['Hidden Crypto Wallet Match', 'Suspicious Cash Withdrawal', 'Unreported Liability Tracked'])}`,
      type: 'financial_anomaly',
      description: `Pattern matched an AI heuristic threshold mapped to recent ${pick(['depositions', 'bank statements', 'credit lines'])}.`,
      severity: pick(['medium', 'high', 'critical']),
      isRead: !isUnread,
      createdAt: randomDate(ninetyDaysAgo, today),
      environment: env
    });
  }
  if (alerts.length) await chunkedInsert(schema.alerts, alerts);

  // --- RECURRING BILLS DEMO DATA ---
  const templates = [];
  const cycles = [];
  for (let i = 0; i < (profile.businessFocus ? 4 : 2); i++) {
    const isMissingScenario = Math.random() > 0.5;
    const vend = pick(EXPENSE_CATEGORIES.find(c => c.c === 'utilities')!.v);
    templates.push({
      caseId: 'demo-case-id', // Placeholder, we don't have explicit caseId here mapped properly except the created case
      userId: clientId,
      environment: env,
      vendorName: vend,
      billName: `${vend} Home Utility`,
      category: 'utilities',
      expectedFrequency: 'monthly',
      expectedDayOfMonth: 15,
      dueDayOfMonth: 20,
      active: true
    });
  }
  const insertedTemplates = templates.length ? await chunkedInsert(schema.recurringBillTemplates, templates) : [];
  
  const nowCycles = new Date();
  const cycleMonth = nowCycles.getMonth() + 1;
  const cycleYear = nowCycles.getFullYear();
  
  for (const t of insertedTemplates as any[]) {
    const isMissingScenario = Math.random() > 0.3; // Make missing bills common for demo
    cycles.push({
      recurringBillTemplateId: t.id,
      cycleMonth,
      cycleYear,
      expectedStartDate: new Date(cycleYear, cycleMonth - 1, 1),
      expectedEndDate: new Date(cycleYear, cycleMonth, 0),
      dueDate: new Date(cycleYear, cycleMonth - 1, t.dueDayOfMonth || 20),
      status: isMissingScenario ? 'missing' : 'pending',
      missingFlag: isMissingScenario,
      createdAt: randomDate(ninetyDaysAgo, today),
      updatedAt: today
    });
  }
  if (cycles.length) await chunkedInsert(schema.recurringBillCycles, cycles);
}

export async function runSeeder() {
  console.log('--- STARTING MULTI-PROFILE DEMO SEEDER ---');
  
  console.log('Clearing existing demo data...');
  const env = 'demo';
  await db.delete(schema.transactions).where(eq(schema.transactions.environment, env));
  await db.delete(schema.assets).where(eq(schema.assets.environment, env));
  await db.delete(schema.debts).where(eq(schema.debts.environment, env));
  await db.delete(schema.incomes).where(eq(schema.incomes.environment, env));
  await db.delete(schema.expenses).where(eq(schema.expenses.environment, env));
  await db.delete(schema.evidenceFiles).where(eq(schema.evidenceFiles.environment, env));
  await db.delete(schema.violations).where(eq(schema.violations.environment, env));
  await db.delete(schema.messages).where(eq(schema.messages.environment, env));
  await db.delete(schema.calendarEvents).where(eq(schema.calendarEvents.environment, env));
  await db.delete(schema.alerts).where(eq(schema.alerts.environment, env));
  await db.delete(schema.documents).where(eq(schema.documents.environment, env));
  await db.delete(schema.cases).where(eq(schema.cases.environment, env));
  await db.delete(schema.w2Records).where(eq(schema.w2Records.environment, env));
  await db.delete(schema.reimbursements).where(eq(schema.reimbursements.environment, env));
  await db.delete(schema.childSupportPayments).where(eq(schema.childSupportPayments.environment, env));
  
  // Wipe recurring bills
  await db.execute(sql`DELETE FROM recurring_bill_cycles WHERE recurring_bill_template_id IN (SELECT id FROM recurring_bill_templates WHERE environment = ${env})`);
  await db.delete(schema.recurringBillTemplates).where(eq(schema.recurringBillTemplates.environment, env));
  
  // Clean up Multi-Tenant structures for the demo env
  await db.execute(sql`DELETE FROM matter_members WHERE matter_id IN (SELECT id FROM matters WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE environment = ${env})))`);
  await db.execute(sql`DELETE FROM matters WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE environment = ${env}))`);
  await db.execute(sql`DELETE FROM workspace_members WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE environment = ${env}))`);
  await db.execute(sql`DELETE FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE environment = ${env})`);
  
  const hashedPass = await hashPassword('password123');

  const profiles: CaseProfile[] = [
    {
      name: 'Demo Client (Messy)',
      email: 'demo.client@demo.com',
      opposingName: 'Sarah Reynolds',
      opposingEmail: 'sarah.opposing@demo.com',
      caseTitle: 'Reynolds vs Reynolds',
      assetCount: 40, debtCount: 20, incomeCount: 8, expenseCount: 40,
      documentCount: 80, transactionCount: 250, violationCount: 25,
      messageCount: 80, eventCount: 20, alertCount: 10,
      assetMultiplier: 1.5, suspicionRate: 0.6, hostileMsgRate: 0.5,
      businessFocus: false, custodyFocus: true
    },
    {
      name: 'John Doe (Clean)',
      email: 'clean@demo.com',
      opposingName: 'Jane Doe',
      opposingEmail: 'jane.opposing@demo.com',
      caseTitle: 'Doe Amicable Separation',
      assetCount: 10, debtCount: 2, incomeCount: 3, expenseCount: 30,
      documentCount: 20, transactionCount: 100, violationCount: 0,
      messageCount: 15, eventCount: 10, alertCount: 0,
      assetMultiplier: 1, suspicionRate: 0.0, hostileMsgRate: 0.0,
      businessFocus: false, custodyFocus: false
    },
    {
      name: 'Mark Sterling (Conflict)',
      email: 'conflict@demo.com',
      opposingName: 'Emily Sterling',
      opposingEmail: 'emily.opposing@demo.com',
      caseTitle: 'Sterling vs Sterling (Contested)',
      assetCount: 15, debtCount: 8, incomeCount: 5, expenseCount: 35,
      documentCount: 40, transactionCount: 150, violationCount: 45,
      messageCount: 90, eventCount: 20, alertCount: 15,
      assetMultiplier: 2.5, suspicionRate: 0.8, hostileMsgRate: 0.9,
      businessFocus: false, custodyFocus: false
    },
    {
      name: 'Victoria Vance (High-Asset)',
      email: 'asset@demo.com',
      opposingName: 'Charles Vance',
      opposingEmail: 'charles.opposing@demo.com',
      caseTitle: 'Vance High Net Worth Estate',
      assetCount: 80, debtCount: 15, incomeCount: 25, expenseCount: 80,
      documentCount: 120, transactionCount: 400, violationCount: 5,
      messageCount: 50, eventCount: 30, alertCount: 20,
      assetMultiplier: 500.0, suspicionRate: 0.5, hostileMsgRate: 0.1,
      businessFocus: true, custodyFocus: false
    },
    {
      name: 'David Brooks (Custody)',
      email: 'custody@demo.com',
      opposingName: 'Mary Brooks',
      opposingEmail: 'mary.opposing@demo.com',
      caseTitle: 'Brooks Custody Dispute',
      assetCount: 5, debtCount: 6, incomeCount: 3, expenseCount: 30,
      documentCount: 30, transactionCount: 120, violationCount: 40,
      messageCount: 120, eventCount: 40, alertCount: 15,
      assetMultiplier: 1, suspicionRate: 0.1, hostileMsgRate: 0.6,
      businessFocus: false, custodyFocus: true
    },
    {
      name: 'Robert Gates (Business)',
      email: 'business@demo.com',
      opposingName: 'Linda Gates',
      opposingEmail: 'linda.opposing@demo.com',
      caseTitle: 'Gates Enterprise Division',
      assetCount: 25, debtCount: 15, incomeCount: 20, expenseCount: 60,
      documentCount: 90, transactionCount: 300, violationCount: 10,
      messageCount: 70, eventCount: 25, alertCount: 15,
      assetMultiplier: 10.0, suspicionRate: 0.7, hostileMsgRate: 0.2,
      businessFocus: true, custodyFocus: false
    }
  ];

  for (const profile of profiles) {
    await seedProfile(profile, hashedPass, env);
  }

  console.log('--- ALL SIMULATIONS COMPLETE ---');
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeeder()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
