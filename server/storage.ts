import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";
import { db, getDb } from "./db";
import { hashPassword, isPasswordHashed } from "./auth";
import {
  users, transactions, assets, debts, incomes, expenses, alerts, violations,
  evidenceFiles, chainOfCustody, messages, cases, teams,
  documents, calendarEvents, legalDocuments, childSupportPayments, mobileViolationReports,
  reimbursements, w2Records, improvementRecommendations,
  journalEntries, journalAttachments, conversations, conversationParticipants,
  conversationMessages, messageAttachments, sentimentReports, sentimentReportItems,
  userDevices, authSessions, mfaChallenges, securityEvents, smsDeliveries,
  fireflyConnections, fireflySyncLogs,
  type User, type InsertUser,
  type Transaction, type InsertTransaction,
  type Asset, type InsertAsset,
  type Debt, type InsertDebt,
  type Income, type InsertIncome,
  type Expense, type InsertExpense,
  type Alert, type InsertAlert,
  type Violation, type InsertViolation,
  type EvidenceFile, type InsertEvidenceFile,
  type ChainOfCustody, type InsertChainOfCustody,
  type Message, type InsertMessage,
  type DashboardStats,
  type Case, type InsertCase,
  type Team, type InsertTeam,
  type Document, type InsertDocument,
  type CalendarEvent, type InsertCalendarEvent,
  type LegalDocument, type InsertLegalDocument,
  type ChildSupportPayment, type InsertChildSupportPayment,
  type MobileViolationReport, type InsertMobileViolationReport,
  type Reimbursement, type InsertReimbursement,
  type W2Record, type InsertW2Record,
  type ImprovementRecommendation, type InsertImprovementRecommendation,
  type JournalEntry, type InsertJournalEntry,
  type JournalAttachment, type InsertJournalAttachment,
  type Conversation, type InsertConversation,
  type ConversationParticipant, type InsertConversationParticipant,
  type ConversationMessage, type InsertConversationMessage,
  type MessageAttachment, type InsertMessageAttachment,
  type SentimentReport, type InsertSentimentReport,
  type SentimentReportItem, type InsertSentimentReportItem,
  type UserDevice, type InsertUserDevice,
  type AuthSession, type InsertAuthSession,
  type MfaChallenge, type InsertMfaChallenge,
  type SecurityEvent, type InsertSecurityEvent,
  type SmsDelivery, type InsertSmsDelivery,
  type FireflyConnection, type InsertFireflyConnection,
  type FireflySyncLog, type InsertFireflySyncLog,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: string, hashedPassword: string): Promise<void>;
  updateUserProfile(id: string, profile: { fullName?: string; email?: string; profilePhoto?: string }): Promise<User | undefined>;
  updateUserLastLogin(id: string): Promise<void>;
  updateUserAdminStatus(id: string, isAdmin: boolean): Promise<void>;
  updateUserStatus(id: string, status: string): Promise<void>;
  updateUserTierAndRole(id: string, updates: { subscriptionTier?: string; role?: string; isAdmin?: boolean; status?: string }): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  
  getTransactions(userId: string, environment: string): Promise<Transaction[]>;
  getRecentTransactions(userId: string, environment: string, limit: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  
  getAssets(userId: string, environment: string): Promise<Asset[]>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  deleteAsset(id: string, userId: string, environment: string): Promise<void>;
  
  getDebts(userId: string, environment: string): Promise<Debt[]>;
  createDebt(debt: InsertDebt): Promise<Debt>;
  deleteDebt(id: string, userId: string, environment: string): Promise<void>;
  
  getIncomes(userId: string, environment: string): Promise<Income[]>;
  createIncome(income: InsertIncome): Promise<Income>;
  deleteIncome(id: string, userId: string, environment: string): Promise<void>;
  
  getExpenses(userId: string, environment: string): Promise<Expense[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  deleteExpense(id: string, userId: string, environment: string): Promise<void>;
  
  getAlerts(userId: string, environment: string): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  markAlertRead(id: string): Promise<void>;
  
  getViolations(userId: string, environment: string): Promise<Violation[]>;
  createViolation(violation: InsertViolation): Promise<Violation>;
  updateViolationStatus(id: string, userId: string, environment: string, status: string): Promise<Violation | undefined>;
  deleteViolation(id: string, userId: string, environment: string): Promise<void>;
  
  getEvidenceFiles(violationId: string, userId: string, environment: string): Promise<EvidenceFile[]>;
  createEvidenceFile(evidenceFile: InsertEvidenceFile): Promise<EvidenceFile>;
  
  getChainOfCustody(evidenceId: string, environment: string): Promise<ChainOfCustody[]>;
  addChainOfCustodyEntry(entry: InsertChainOfCustody): Promise<ChainOfCustody>;
  
  getMessages(environment: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  getDashboardStats(userId: string, environment: string): Promise<DashboardStats>;
  
  // Case management
  getCases(userId: string, environment: string): Promise<Case[]>;
  getCase(id: string, userId: string, environment: string): Promise<Case | undefined>;
  createCase(caseData: InsertCase): Promise<Case>;
  deleteCase(id: string, userId: string, environment: string): Promise<void>;
  
  // Team management
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  getTeamMembers(teamId: string): Promise<User[]>;
  
  // User subscription management
  updateUserTier(userId: string, tier: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<User | undefined>;
  updateUserStripeInfo(userId: string, info: { stripeCustomerId?: string; stripeSubscriptionId?: string }): Promise<User | undefined>;
  incrementViolationCount(userId: string): Promise<void>;
  incrementCaseCount(userId: string): Promise<void>;
  decrementCaseCount(userId: string): Promise<void>;
  resetMonthlyViolationCount(userId: string): Promise<void>;
  
  // Voice & Media usage tracking
  incrementVoiceTranscriptionCount(userId: string): Promise<void>;
  incrementMediaUploadCount(userId: string, count?: number): Promise<void>;
  resetMonthlyUsageCounts(userId: string): Promise<void>;
  
  // Documents management
  getDocuments(userId: string, environment: string): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: string, updates: Partial<Document>): Promise<Document | undefined>;
  deleteDocument(id: string, userId: string, environment: string): Promise<void>;
  
  // Mobile violation reports
  getMobileViolationReports(userId: string, environment: string): Promise<MobileViolationReport[]>;
  getMobileViolationReport(id: string): Promise<MobileViolationReport | undefined>;
  createMobileViolationReport(report: InsertMobileViolationReport): Promise<MobileViolationReport>;
  updateMobileViolationReport(id: string, updates: Partial<MobileViolationReport>): Promise<MobileViolationReport | undefined>;
  deleteMobileViolationReport(id: string): Promise<void>;
  
  // Reimbursements management
  getReimbursements(userId: string, environment: string): Promise<Reimbursement[]>;
  getReimbursement(id: string): Promise<Reimbursement | undefined>;
  createReimbursement(reimbursement: InsertReimbursement): Promise<Reimbursement>;
  updateReimbursement(id: string, updates: Partial<Reimbursement>): Promise<Reimbursement | undefined>;
  deleteReimbursement(id: string): Promise<void>;
  
  // Calendar events management
  getCalendarEvents(userId: string, environment: string): Promise<CalendarEvent[]>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  deleteCalendarEvent(id: string, userId: string, environment: string): Promise<void>;
  
  // Legal documents management
  getLegalDocuments(userId: string, environment: string): Promise<LegalDocument[]>;
  createLegalDocument(document: InsertLegalDocument): Promise<LegalDocument>;
  deleteLegalDocument(id: string, userId: string, environment: string): Promise<void>;
  
  // Child support payments management
  getChildSupportPayments(userId: string, environment: string): Promise<ChildSupportPayment[]>;
  createChildSupportPayment(payment: InsertChildSupportPayment): Promise<ChildSupportPayment>;
  updateChildSupportPayment(id: string, userId: string, environment: string, update: Partial<ChildSupportPayment>): Promise<ChildSupportPayment | undefined>;
  deleteChildSupportPayment(id: string, userId: string, environment: string): Promise<void>;
  
  // Password reset
  setPasswordResetToken(userId: string, token: string, expires: Date): Promise<void>;
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;
  clearPasswordResetToken(userId: string): Promise<void>;
  
  // Improvement recommendations (demo testing)
  getImprovementRecommendations(environment: string, status?: string): Promise<ImprovementRecommendation[]>;
  getAllImprovementRecommendations(): Promise<ImprovementRecommendation[]>;
  getImprovementRecommendation(id: string): Promise<ImprovementRecommendation | undefined>;
  createImprovementRecommendation(recommendation: InsertImprovementRecommendation): Promise<ImprovementRecommendation>;
  updateImprovementRecommendation(id: string, updates: Partial<ImprovementRecommendation>): Promise<ImprovementRecommendation | undefined>;
  updateImprovementRecommendationStatus(id: string, status: string): Promise<ImprovementRecommendation | undefined>;
  deleteImprovementRecommendation(id: string): Promise<void>;
  getImplementedRecommendations(): Promise<ImprovementRecommendation[]>;

  // Journal entries
  getJournalEntries(userId: string, environment: string): Promise<JournalEntry[]>;
  getJournalEntry(id: string): Promise<JournalEntry | undefined>;
  createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry>;
  updateJournalEntry(id: string, updates: Partial<JournalEntry>): Promise<JournalEntry | undefined>;
  deleteJournalEntry(id: string): Promise<void>;
  
  // Journal attachments
  getJournalAttachments(journalEntryId: string): Promise<JournalAttachment[]>;
  createJournalAttachment(attachment: InsertJournalAttachment): Promise<JournalAttachment>;
  deleteJournalAttachment(id: string): Promise<void>;

  // Conversations
  getConversations(userId: string, environment: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  
  // Conversation participants
  getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]>;
  addConversationParticipant(participant: InsertConversationParticipant): Promise<ConversationParticipant>;
  removeConversationParticipant(id: string): Promise<void>;

  // Conversation messages
  getConversationMessages(conversationId: string): Promise<ConversationMessage[]>;
  createConversationMessage(message: InsertConversationMessage): Promise<ConversationMessage>;
  updateConversationMessage(id: string, updates: Partial<ConversationMessage>): Promise<ConversationMessage | undefined>;

  // Sentiment reports
  getSentimentReports(conversationId: string): Promise<SentimentReport[]>;
  getSentimentReport(id: string): Promise<SentimentReport | undefined>;
  createSentimentReport(report: InsertSentimentReport): Promise<SentimentReport>;
  updateSentimentReport(id: string, updates: Partial<SentimentReport>): Promise<SentimentReport | undefined>;
  
  // Sentiment report items
  getSentimentReportItems(reportId: string): Promise<SentimentReportItem[]>;
  createSentimentReportItem(item: InsertSentimentReportItem): Promise<SentimentReportItem>;
  
  // ============================================
  // SECURITY - DEVICE & SESSION MANAGEMENT
  // ============================================
  
  // User devices
  getUserDevices(userId: string): Promise<UserDevice[]>;
  getDeviceByFingerprint(userId: string, fingerprint: string): Promise<UserDevice | undefined>;
  createDevice(device: InsertUserDevice): Promise<UserDevice>;
  updateDevice(id: string, updates: Partial<UserDevice>): Promise<UserDevice | undefined>;
  blockDevice(id: string): Promise<void>;
  unblockDevice(id: string): Promise<void>;
  
  // Auth sessions
  getSession(id: string): Promise<AuthSession | undefined>;
  getSessionByToken(tokenHash: string): Promise<AuthSession | undefined>;
  getUserSessions(userId: string): Promise<AuthSession[]>;
  getActiveSessionsForUser(userId: string): Promise<AuthSession[]>;
  createSession(session: InsertAuthSession): Promise<AuthSession>;
  updateSession(id: string, updates: Partial<AuthSession>): Promise<AuthSession | undefined>;
  revokeSession(id: string, reason: string): Promise<void>;
  revokeAllUserSessions(userId: string, reason: string, exceptSessionId?: string): Promise<void>;
  
  // MFA challenges
  createMfaChallenge(challenge: InsertMfaChallenge): Promise<MfaChallenge>;
  getMfaChallenge(id: string): Promise<MfaChallenge | undefined>;
  getActiveMfaChallenge(userId: string): Promise<MfaChallenge | undefined>;
  updateMfaChallenge(id: string, updates: Partial<MfaChallenge>): Promise<MfaChallenge | undefined>;
  incrementMfaAttempts(id: string): Promise<void>;
  
  // Security events
  logSecurityEvent(event: InsertSecurityEvent): Promise<SecurityEvent>;
  getSecurityEvents(userId: string, limit?: number): Promise<SecurityEvent[]>;
  getAllSecurityEvents(limit?: number): Promise<SecurityEvent[]>;
  
  // SMS deliveries
  createSmsDelivery(delivery: InsertSmsDelivery): Promise<SmsDelivery>;
  updateSmsDeliveryStatus(id: string, status: string, errorCode?: string, errorMessage?: string): Promise<void>;
  getSmsDeliveries(userId: string, limit?: number): Promise<SmsDelivery[]>;
  
  // User phone management
  updateUserPhone(userId: string, phoneNumber: string): Promise<void>;
  verifyUserPhone(userId: string): Promise<void>;
  enableTwoFactor(userId: string, method?: string): Promise<void>;
  disableTwoFactor(userId: string): Promise<void>;

  // Demo reset
  resetDemoEnvironment(): Promise<void>;
  
  // ============================================
  // FIREFLY III INTEGRATION
  // ============================================
  
  getFireflyConnection(userId: string, environment: string): Promise<FireflyConnection | undefined>;
  createFireflyConnection(connection: InsertFireflyConnection): Promise<FireflyConnection>;
  updateFireflyConnection(id: string, updates: Partial<FireflyConnection>): Promise<FireflyConnection | undefined>;
  deleteFireflyConnection(id: string): Promise<void>;
  createFireflySyncLog(log: InsertFireflySyncLog): Promise<FireflySyncLog>;
  updateFireflySyncLog(id: string, updates: Partial<FireflySyncLog>): Promise<FireflySyncLog | undefined>;
  getFireflySyncLogs(connectionId: string, limit?: number): Promise<FireflySyncLog[]>;
  getFireflySyncLogBySourceId(sourceType: string, sourceId: string): Promise<FireflySyncLog | undefined>;
}

export const TEST_USERS = [
  { id: "test1", email: "test1@example.com", password: "test123", fullName: "Test User 1", isAdmin: false, environment: "test-1" },
  { id: "test2", email: "test2@example.com", password: "test123", fullName: "Test User 2", isAdmin: false, environment: "test-2" },
  { id: "test3", email: "test3@example.com", password: "test123", fullName: "Test User 3", isAdmin: false, environment: "test-3" },
  { id: "test4", email: "test4@example.com", password: "admin123", fullName: "Test Admin 4", isAdmin: true, environment: "test-4" },
  { id: "test5", email: "test5@example.com", password: "admin123", fullName: "Test Admin 5", isAdmin: true, environment: "test-5" },
];

export async function seedDemoData() {
  // Demo seeding logic
}

export async function seedTestUsers() {
  // Test users seeding logic
}

// In-memory cache for static metadata
const TIER_CACHE = new Map<string, any>();

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async updateUserProfile(id: string, profile: { fullName?: string; email?: string; profilePhoto?: string }): Promise<User | undefined> {
    const updateData: Partial<User> = {};
    if (profile.fullName !== undefined) updateData.fullName = profile.fullName;
    if (profile.email !== undefined) updateData.email = profile.email;
    if (profile.profilePhoto !== undefined) updateData.profilePhoto = profile.profilePhoto;
    
    const result = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateUserLastLogin(id: string): Promise<void> {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  }

  async updateUserAdminStatus(id: string, isAdmin: boolean): Promise<void> {
    await db.update(users).set({ isAdmin, role: isAdmin ? "admin" : "client" }).where(eq(users.id, id));
  }

  async updateUserStatus(id: string, status: string): Promise<void> {
    await db.update(users).set({ status }).where(eq(users.id, id));
  }

  async updateUserTierAndRole(id: string, updates: { subscriptionTier?: string; role?: string; isAdmin?: boolean; status?: string }): Promise<User | undefined> {
    const updateData: Partial<User> = {};
    if (updates.subscriptionTier !== undefined) updateData.subscriptionTier = updates.subscriptionTier;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.isAdmin !== undefined) updateData.isAdmin = updates.isAdmin;
    if (updates.status !== undefined) updateData.status = updates.status;
    
    const result = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getTransactions(userId: string, environment: string): Promise<Transaction[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(transactions).where(
      and(eq(transactions.userId, userId), eq(transactions.environment, environment))
    ).orderBy(desc(transactions.date));
  }

  async getRecentTransactions(userId: string, environment: string, limit: number): Promise<Transaction[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(transactions).where(
      and(eq(transactions.userId, userId), eq(transactions.environment, environment))
    ).orderBy(desc(transactions.date)).limit(limit);
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const result = await db.insert(transactions).values(transaction).returning();
    return result[0];
  }

  async getAssets(userId: string, environment: string): Promise<Asset[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(assets).where(
      and(eq(assets.userId, userId), eq(assets.environment, environment))
    );
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    const result = await db.insert(assets).values(asset).returning();
    return result[0];
  }

  async deleteAsset(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(assets).where(
      and(eq(assets.id, id), eq(assets.userId, userId), eq(assets.environment, environment))
    );
  }

  async getDebts(userId: string, environment: string): Promise<Debt[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(debts).where(
      and(eq(debts.userId, userId), eq(debts.environment, environment))
    );
  }

  async createDebt(debt: InsertDebt): Promise<Debt> {
    const result = await db.insert(debts).values(debt).returning();
    return result[0];
  }

  async deleteDebt(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(debts).where(
      and(eq(debts.id, id), eq(debts.userId, userId), eq(debts.environment, environment))
    );
  }

  async getIncomes(userId: string, environment: string): Promise<Income[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(incomes).where(
      and(eq(incomes.userId, userId), eq(incomes.environment, environment))
    );
  }

  async createIncome(income: InsertIncome): Promise<Income> {
    const result = await db.insert(incomes).values(income).returning();
    return result[0];
  }

  async deleteIncome(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(incomes).where(
      and(eq(incomes.id, id), eq(incomes.userId, userId), eq(incomes.environment, environment))
    );
  }

  async getExpenses(userId: string, environment: string): Promise<Expense[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(expenses).where(
      and(eq(expenses.userId, userId), eq(expenses.environment, environment))
    );
  }

  async createExpense(expense: InsertExpense): Promise<Expense> {
    const result = await db.insert(expenses).values(expense).returning();
    return result[0];
  }

  async deleteExpense(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(expenses).where(
      and(eq(expenses.id, id), eq(expenses.userId, userId), eq(expenses.environment, environment))
    );
  }

  async getAlerts(userId: string, environment: string): Promise<Alert[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(alerts).where(
      and(eq(alerts.userId, userId), eq(alerts.environment, environment))
    ).orderBy(desc(alerts.id));
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const result = await db.insert(alerts).values(alert).returning();
    return result[0];
  }

  async markAlertRead(id: string): Promise<void> {
    await db.update(alerts).set({ isRead: true }).where(eq(alerts.id, id));
  }

  async getViolations(userId: string, environment: string): Promise<Violation[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(violations).where(
      and(eq(violations.userId, userId), eq(violations.environment, environment))
    ).orderBy(desc(violations.id));
  }

  async createViolation(violation: InsertViolation): Promise<Violation> {
    const result = await db.insert(violations).values(violation).returning();
    return result[0];
  }

  async updateViolationStatus(id: string, userId: string, environment: string, status: string): Promise<Violation | undefined> {
    const result = await db.update(violations)
      .set({ status })
      .where(and(eq(violations.id, id), eq(violations.userId, userId), eq(violations.environment, environment)))
      .returning();
    return result[0];
  }

  async deleteViolation(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(violations).where(
      and(eq(violations.id, id), eq(violations.userId, userId), eq(violations.environment, environment))
    );
  }

  async getEvidenceFiles(violationId: string, userId: string, environment: string): Promise<EvidenceFile[]> {
    return db.select().from(evidenceFiles).where(
      and(
        eq(evidenceFiles.violationId, violationId),
        eq(evidenceFiles.userId, userId),
        eq(evidenceFiles.environment, environment)
      )
    );
  }

  async createEvidenceFile(evidenceFile: InsertEvidenceFile): Promise<EvidenceFile> {
    const result = await db.insert(evidenceFiles).values(evidenceFile).returning();
    return result[0];
  }

  async getChainOfCustody(evidenceId: string, environment: string): Promise<ChainOfCustody[]> {
    return db.select().from(chainOfCustody).where(
      and(eq(chainOfCustody.evidenceId, evidenceId), eq(chainOfCustody.environment, environment))
    );
  }

  async addChainOfCustodyEntry(entry: InsertChainOfCustody): Promise<ChainOfCustody> {
    const result = await db.insert(chainOfCustody).values(entry).returning();
    return result[0];
  }

  async getMessages(environment: string): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.environment, environment)).orderBy(desc(messages.id));
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(message).returning();
    return result[0];
  }

  async getDashboardStats(userId: string, environment: string): Promise<DashboardStats> {
    const currentDb = getDb(environment);
    
    // Optimized: Execute counting queries in parallel
    const [
      assetsRes,
      debtsRes,
      incomeRes,
      expenseRes,
      violationsRes,
      casesRes,
      childSupportRes
    ] = await Promise.all([
      currentDb.select().from(assets).where(and(eq(assets.userId, userId), eq(assets.environment, environment))),
      currentDb.select().from(debts).where(and(eq(debts.userId, userId), eq(debts.environment, environment))),
      currentDb.select().from(incomes).where(and(eq(incomes.userId, userId), eq(incomes.environment, environment))),
      currentDb.select().from(expenses).where(and(eq(expenses.userId, userId), eq(expenses.environment, environment))),
      currentDb.select().from(violations).where(and(eq(violations.userId, userId), eq(violations.environment, environment))),
      currentDb.select().from(cases).where(and(eq(cases.userId, userId), eq(cases.environment, environment))),
      currentDb.select().from(childSupportPayments).where(and(eq(childSupportPayments.userId, userId), eq(childSupportPayments.environment, environment)))
    ]);

    const totalAssets = assetsRes.reduce((sum, a) => sum + (a.value || 0), 0);
    const maritalAssets = assetsRes.filter(a => a.ownership === 'marital').reduce((sum, a) => sum + (a.value || 0), 0);
    const totalDebts = debtsRes.reduce((sum, d) => sum + (d.amount || 0), 0);
    const monthlyIncome = incomeRes.reduce((sum, i) => {
      const amount = i.amount || 0;
      if (i.frequency === 'weekly') return sum + (amount * 52 / 12);
      if (i.frequency === 'bi-weekly') return sum + (amount * 26 / 12);
      return sum + amount;
    }, 0);
    const monthlyExpenses = expenseRes.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Calculate child support and alimony from actual payment records
    const childSupportOwed = childSupportRes
      .filter(p => p.paymentType === 'child_support' && p.status === 'pending')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const alimonyOwed = childSupportRes
      .filter(p => p.paymentType === 'alimony' && p.status === 'pending')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      totalAssets,
      maritalAssets,
      totalDebts,
      monthlyIncome,
      monthlyExpenses,
      violationsCount: violationsRes.length,
      casesCount: casesRes.length,
      childSupportOwed,
      alimonyOwed,
      netPosition: totalAssets - totalDebts,
    };
  }

  async getCases(userId: string, environment: string): Promise<Case[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(cases).where(
      and(eq(cases.userId, userId), eq(cases.environment, environment))
    );
  }

  async getCase(id: string, userId: string, environment: string): Promise<Case | undefined> {
    const currentDb = getDb(environment);
    const result = await currentDb.select().from(cases).where(
      and(eq(cases.id, id), eq(cases.userId, userId), eq(cases.environment, environment))
    );
    return result[0];
  }

  async createCase(caseData: InsertCase): Promise<Case> {
    const result = await db.insert(cases).values(caseData).returning();
    return result[0];
  }

  async deleteCase(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(cases).where(
      and(eq(cases.id, id), eq(cases.userId, userId), eq(cases.environment, environment))
    );
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const result = await db.select().from(teams).where(eq(teams.id, id));
    return result[0];
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const result = await db.insert(teams).values(team).returning();
    return result[0];
  }

  async getTeamMembers(teamId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.teamId, teamId));
  }

  async updateUserTier(userId: string, tier: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<User | undefined> {
    const updateData: any = { subscriptionTier: tier };
    if (stripeCustomerId) updateData.stripeCustomerId = stripeCustomerId;
    if (stripeSubscriptionId) updateData.stripeSubscriptionId = stripeSubscriptionId;
    
    const result = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    return result[0];
  }

  async updateUserStripeInfo(userId: string, info: { stripeCustomerId?: string; stripeSubscriptionId?: string }): Promise<User | undefined> {
    const result = await db.update(users).set(info).where(eq(users.id, userId)).returning();
    return result[0];
  }

  async incrementViolationCount(userId: string): Promise<void> {
    await db.update(users)
      .set({ violationsCountThisMonth: sql`${users.violationsCountThisMonth} + 1` })
      .where(eq(users.id, userId));
  }

  async incrementCaseCount(userId: string): Promise<void> {
    await db.update(users)
      .set({ casesCount: sql`${users.casesCount} + 1` })
      .where(eq(users.id, userId));
  }

  async decrementCaseCount(userId: string): Promise<void> {
    await db.update(users)
      .set({ casesCount: sql`GREATEST(0, ${users.casesCount} - 1)` })
      .where(eq(users.id, userId));
  }

  async resetMonthlyViolationCount(userId: string): Promise<void> {
    await db.update(users)
      .set({ violationsCountThisMonth: 0 })
      .where(eq(users.id, userId));
  }

  async incrementVoiceTranscriptionCount(userId: string): Promise<void> {
    await db.update(users)
      .set({ voiceTranscriptionsThisMonth: sql`${users.voiceTranscriptionsThisMonth} + 1` })
      .where(eq(users.id, userId));
  }

  async incrementMediaUploadCount(userId: string, count = 1): Promise<void> {
    await db.update(users)
      .set({ mediaUploadsThisMonth: sql`${users.mediaUploadsThisMonth} + ${count}` })
      .where(eq(users.id, userId));
  }

  async resetMonthlyUsageCounts(userId: string): Promise<void> {
    await db.update(users)
      .set({ 
        violationsCountThisMonth: 0,
        voiceTranscriptionsThisMonth: 0,
        mediaUploadsThisMonth: 0
      })
      .where(eq(users.id, userId));
  }

  async getDocuments(userId: string, environment: string): Promise<Document[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(documents).where(
      and(eq(documents.userId, userId), eq(documents.environment, environment))
    ).orderBy(desc(documents.createdAt));
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const result = await db.select().from(documents).where(eq(documents.id, id));
    return result[0];
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const result = await db.insert(documents).values(document).returning();
    return result[0];
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document | undefined> {
    const result = await db.update(documents).set(updates).where(eq(documents.id, id)).returning();
    return result[0];
  }

  async deleteDocument(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(documents).where(
      and(eq(documents.id, id), eq(documents.userId, userId), eq(documents.environment, environment))
    );
  }

  async getMobileViolationReports(userId: string, environment: string): Promise<MobileViolationReport[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(mobileViolationReports).where(
      and(eq(mobileViolationReports.userId, userId), eq(mobileViolationReports.environment, environment))
    ).orderBy(desc(mobileViolationReports.createdAt));
  }

  async getMobileViolationReport(id: string): Promise<MobileViolationReport | undefined> {
    const result = await db.select().from(mobileViolationReports).where(eq(mobileViolationReports.id, id));
    return result[0];
  }

  async createMobileViolationReport(report: InsertMobileViolationReport): Promise<MobileViolationReport> {
    const result = await db.insert(mobileViolationReports).values(report).returning();
    return result[0];
  }

  async updateMobileViolationReport(id: string, updates: Partial<MobileViolationReport>): Promise<MobileViolationReport | undefined> {
    const result = await db.update(mobileViolationReports).set(updates).where(eq(mobileViolationReports.id, id)).returning();
    return result[0];
  }

  async deleteMobileViolationReport(id: string): Promise<void> {
    await db.delete(mobileViolationReports).where(eq(mobileViolationReports.id, id));
  }

  async getReimbursements(userId: string, environment: string): Promise<Reimbursement[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(reimbursements).where(
      and(eq(reimbursements.userId, userId), eq(reimbursements.environment, environment))
    ).orderBy(desc(reimbursements.createdAt));
  }

  async getReimbursement(id: string): Promise<Reimbursement | undefined> {
    const result = await db.select().from(reimbursements).where(eq(reimbursements.id, id));
    return result[0];
  }

  async createReimbursement(reimbursement: InsertReimbursement): Promise<Reimbursement> {
    const result = await db.insert(reimbursements).values(reimbursement).returning();
    return result[0];
  }

  async updateReimbursement(id: string, updates: Partial<Reimbursement>): Promise<Reimbursement | undefined> {
    const result = await db.update(reimbursements).set(updates).where(eq(reimbursements.id, id)).returning();
    return result[0];
  }

  async deleteReimbursement(id: string): Promise<void> {
    await db.delete(reimbursements).where(eq(reimbursements.id, id));
  }

  async getCalendarEvents(userId: string, environment: string): Promise<CalendarEvent[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(calendarEvents).where(
      and(eq(calendarEvents.userId, userId), eq(calendarEvents.environment, environment))
    ).orderBy(desc(calendarEvents.startDate));
  }

  async createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const result = await db.insert(calendarEvents).values(event).returning();
    return result[0];
  }

  async deleteCalendarEvent(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(calendarEvents).where(
      and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId), eq(calendarEvents.environment, environment))
    );
  }

  async getLegalDocuments(userId: string, environment: string): Promise<LegalDocument[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(legalDocuments).where(
      and(eq(legalDocuments.userId, userId), eq(legalDocuments.environment, environment))
    ).orderBy(desc(legalDocuments.filingDate));
  }

  async createLegalDocument(document: InsertLegalDocument): Promise<LegalDocument> {
    const result = await db.insert(legalDocuments).values(document).returning();
    return result[0];
  }

  async deleteLegalDocument(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(legalDocuments).where(
      and(eq(legalDocuments.id, id), eq(legalDocuments.userId, userId), eq(legalDocuments.environment, environment))
    );
  }

  async getChildSupportPayments(userId: string, environment: string): Promise<ChildSupportPayment[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(childSupportPayments).where(
      and(eq(childSupportPayments.userId, userId), eq(childSupportPayments.environment, environment))
    ).orderBy(desc(childSupportPayments.dueDate));
  }

  async createChildSupportPayment(payment: InsertChildSupportPayment): Promise<ChildSupportPayment> {
    const result = await db.insert(childSupportPayments).values(payment).returning();
    return result[0];
  }

  async updateChildSupportPayment(id: string, userId: string, environment: string, update: Partial<ChildSupportPayment>): Promise<ChildSupportPayment | undefined> {
    const result = await db.update(childSupportPayments)
      .set(update)
      .where(and(eq(childSupportPayments.id, id), eq(childSupportPayments.userId, userId), eq(childSupportPayments.environment, environment)))
      .returning();
    return result[0];
  }

  async deleteChildSupportPayment(id: string, userId: string, environment: string): Promise<void> {
    await db.delete(childSupportPayments).where(
      and(eq(childSupportPayments.id, id), eq(childSupportPayments.userId, userId), eq(childSupportPayments.environment, environment))
    );
  }

  async setPasswordResetToken(userId: string, token: string, expires: Date): Promise<void> {
    await db.update(users).set({ passwordResetToken: token, passwordResetExpires: expires }).where(eq(users.id, userId));
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.passwordResetToken, token));
    const user = result[0];
    if (user && user.passwordResetExpires && user.passwordResetExpires > new Date()) {
      return user;
    }
    return undefined;
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await db.update(users).set({ passwordResetToken: null, passwordResetExpires: null }).where(eq(users.id, userId));
  }

  async getImprovementRecommendations(environment: string, status?: string): Promise<ImprovementRecommendation[]> {
    const filters = [eq(improvementRecommendations.environment, environment)];
    if (status) filters.push(eq(improvementRecommendations.status, status));
    return db.select().from(improvementRecommendations).where(and(...filters)).orderBy(desc(improvementRecommendations.createdAt));
  }

  async getAllImprovementRecommendations(): Promise<ImprovementRecommendation[]> {
    return db.select().from(improvementRecommendations).orderBy(desc(improvementRecommendations.createdAt));
  }

  async getImprovementRecommendation(id: string): Promise<ImprovementRecommendation | undefined> {
    const result = await db.select().from(improvementRecommendations).where(eq(improvementRecommendations.id, id));
    return result[0];
  }

  async createImprovementRecommendation(recommendation: InsertImprovementRecommendation): Promise<ImprovementRecommendation> {
    const result = await db.insert(improvementRecommendations).values(recommendation).returning();
    return result[0];
  }

  async updateImprovementRecommendation(id: string, updates: Partial<ImprovementRecommendation>): Promise<ImprovementRecommendation | undefined> {
    const result = await db.update(improvementRecommendations).set(updates).where(eq(improvementRecommendations.id, id)).returning();
    return result[0];
  }

  async updateImprovementRecommendationStatus(id: string, status: string): Promise<ImprovementRecommendation | undefined> {
    const result = await db.update(improvementRecommendations).set({ status }).where(eq(improvementRecommendations.id, id)).returning();
    return result[0];
  }

  async deleteImprovementRecommendation(id: string): Promise<void> {
    await db.delete(improvementRecommendations).where(eq(improvementRecommendations.id, id));
  }

  async getImplementedRecommendations(): Promise<ImprovementRecommendation[]> {
    return db.select().from(improvementRecommendations).where(eq(improvementRecommendations.status, 'implemented')).orderBy(desc(improvementRecommendations.updatedAt));
  }

  async getJournalEntries(userId: string, environment: string): Promise<JournalEntry[]> {
    const currentDb = getDb(environment);
    return currentDb.select().from(journalEntries).where(
      and(eq(journalEntries.userId, userId), eq(journalEntries.environment, environment))
    ).orderBy(desc(journalEntries.createdAt));
  }

  async getJournalEntry(id: string): Promise<JournalEntry | undefined> {
    const result = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    return result[0];
  }

  async createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry> {
    const result = await db.insert(journalEntries).values(entry).returning();
    return result[0];
  }

  async updateJournalEntry(id: string, updates: Partial<JournalEntry>): Promise<JournalEntry | undefined> {
    const result = await db.update(journalEntries).set(updates).where(eq(journalEntries.id, id)).returning();
    return result[0];
  }

  async deleteJournalEntry(id: string): Promise<void> {
    await db.delete(journalEntries).where(eq(journalEntries.id, id));
  }

  async getJournalAttachments(journalEntryId: string): Promise<JournalAttachment[]> {
    return db.select().from(journalAttachments).where(eq(journalAttachments.journalEntryId, journalEntryId));
  }

  async createJournalAttachment(attachment: InsertJournalAttachment): Promise<JournalAttachment> {
    const result = await db.insert(journalAttachments).values(attachment).returning();
    return result[0];
  }

  async deleteJournalAttachment(id: string): Promise<void> {
    await db.delete(journalAttachments).where(eq(journalAttachments.id, id));
  }

  async getConversations(userId: string, environment: string): Promise<Conversation[]> {
    const currentDb = getDb(environment);
    // Optimized: Single query with join
    const result = await currentDb.select({
      conversation: conversations
    })
    .from(conversations)
    .innerJoin(conversationParticipants, eq(conversations.id, conversationParticipants.conversationId))
    .where(and(eq(conversationParticipants.userId, userId), eq(conversations.environment, environment)))
    .orderBy(desc(conversations.updatedAt));

    return result.map(r => r.conversation);
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const result = await db.select().from(conversations).where(eq(conversations.id, id));
    return result[0];
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(conversation).returning();
    return result[0];
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const result = await db.update(conversations).set(updates).where(eq(conversations.id, id)).returning();
    return result[0];
  }

  async getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]> {
    return db.select().from(conversationParticipants).where(eq(conversationParticipants.conversationId, conversationId));
  }

  async addConversationParticipant(participant: InsertConversationParticipant): Promise<ConversationParticipant> {
    const result = await db.insert(conversationParticipants).values(participant).returning();
    return result[0];
  }

  async removeConversationParticipant(id: string): Promise<void> {
    await db.delete(conversationParticipants).where(eq(conversationParticipants.id, id));
  }

  async getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    return db.select().from(conversationMessages).where(eq(conversationMessages.conversationId, conversationId)).orderBy(desc(conversationMessages.createdAt));
  }

  async createConversationMessage(message: InsertConversationMessage): Promise<ConversationMessage> {
    const result = await db.insert(conversationMessages).values(message).returning();
    return result[0];
  }

  async updateConversationMessage(id: string, updates: Partial<ConversationMessage>): Promise<ConversationMessage | undefined> {
    const result = await db.update(conversationMessages).set(updates).where(eq(conversationMessages.id, id)).returning();
    return result[0];
  }

  async getSentimentReports(conversationId: string): Promise<SentimentReport[]> {
    return db.select().from(sentimentReports).where(eq(sentimentReports.conversationId, conversationId)).orderBy(desc(sentimentReports.createdAt));
  }

  async getSentimentReport(id: string): Promise<SentimentReport | undefined> {
    const result = await db.select().from(sentimentReports).where(eq(sentimentReports.id, id));
    return result[0];
  }

  async createSentimentReport(report: InsertSentimentReport): Promise<SentimentReport> {
    const result = await db.insert(sentimentReports).values(report).returning();
    return result[0];
  }

  async updateSentimentReport(id: string, updates: Partial<SentimentReport>): Promise<SentimentReport | undefined> {
    const result = await db.update(sentimentReports).set(updates).where(eq(sentimentReports.id, id)).returning();
    return result[0];
  }

  async getSentimentReportItems(reportId: string): Promise<SentimentReportItem[]> {
    return db.select().from(sentimentReportItems).where(eq(sentimentReportItems.reportId, reportId));
  }

  async createSentimentReportItem(item: InsertSentimentReportItem): Promise<SentimentReportItem> {
    const result = await db.insert(sentimentReportItems).values(item).returning();
    return result[0];
  }

  async getUserDevices(userId: string): Promise<UserDevice[]> {
    return db.select().from(userDevices).where(eq(userDevices.userId, userId));
  }

  async getDeviceByFingerprint(userId: string, fingerprint: string): Promise<UserDevice | undefined> {
    const result = await db.select().from(userDevices).where(and(eq(userDevices.userId, userId), eq(userDevices.deviceFingerprint, fingerprint)));
    return result[0];
  }

  async createDevice(device: InsertUserDevice): Promise<UserDevice> {
    const result = await db.insert(userDevices).values(device).returning();
    return result[0];
  }

  async updateDevice(id: string, updates: Partial<UserDevice>): Promise<UserDevice | undefined> {
    const result = await db.update(userDevices).set(updates).where(eq(userDevices.id, id)).returning();
    return result[0];
  }

  async blockDevice(id: string): Promise<void> {
    await db.update(userDevices).set({ isBlocked: true }).where(eq(userDevices.id, id));
  }

  async unblockDevice(id: string): Promise<void> {
    await db.update(userDevices).set({ isBlocked: false }).where(eq(userDevices.id, id));
  }

  async getSession(id: string): Promise<AuthSession | undefined> {
    const result = await db.select().from(authSessions).where(eq(authSessions.id, id));
    return result[0];
  }

  async getSessionByToken(tokenHash: string): Promise<AuthSession | undefined> {
    const result = await db.select().from(authSessions).where(eq(authSessions.refreshTokenHash, tokenHash));
    return result[0];
  }

  async getUserSessions(userId: string): Promise<AuthSession[]> {
    return db.select().from(authSessions).where(eq(authSessions.userId, userId));
  }

  async getActiveSessionsForUser(userId: string): Promise<AuthSession[]> {
    return db.select().from(authSessions).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
  }

  async createSession(session: InsertAuthSession): Promise<AuthSession> {
    const result = await db.insert(authSessions).values(session).returning();
    return result[0];
  }

  async updateSession(id: string, updates: Partial<AuthSession>): Promise<AuthSession | undefined> {
    const result = await db.update(authSessions).set(updates).where(eq(authSessions.id, id)).returning();
    return result[0];
  }

  async revokeSession(id: string, reason: string): Promise<void> {
    await db.update(authSessions).set({ revokedAt: new Date(), revokedReason: reason }).where(eq(authSessions.id, id));
  }

  async revokeAllUserSessions(userId: string, reason: string, exceptSessionId?: string): Promise<void> {
    const filters = [eq(authSessions.userId, userId), isNull(authSessions.revokedAt)];
    if (exceptSessionId) filters.push(sql`${authSessions.id} != ${exceptSessionId}`);
    await db.update(authSessions).set({ revokedAt: new Date(), revokedReason: reason }).where(and(...filters));
  }

  async createMfaChallenge(challenge: InsertMfaChallenge): Promise<MfaChallenge> {
    const result = await db.insert(mfaChallenges).values(challenge).returning();
    return result[0];
  }

  async getMfaChallenge(id: string): Promise<MfaChallenge | undefined> {
    const result = await db.select().from(mfaChallenges).where(eq(mfaChallenges.id, id));
    return result[0];
  }

  async getActiveMfaChallenge(userId: string): Promise<MfaChallenge | undefined> {
    const result = await db.select().from(mfaChallenges).where(and(eq(mfaChallenges.userId, userId), isNull(mfaChallenges.verifiedAt))).orderBy(desc(mfaChallenges.createdAt)).limit(1);
    return result[0];
  }

  async updateMfaChallenge(id: string, updates: Partial<MfaChallenge>): Promise<MfaChallenge | undefined> {
    const result = await db.update(mfaChallenges).set(updates).where(eq(mfaChallenges.id, id)).returning();
    return result[0];
  }

  async incrementMfaAttempts(id: string): Promise<void> {
    await db.update(mfaChallenges).set({ attemptCount: sql`${mfaChallenges.attemptCount} + 1` }).where(eq(mfaChallenges.id, id));
  }

  async logSecurityEvent(event: InsertSecurityEvent): Promise<SecurityEvent> {
    const result = await db.insert(securityEvents).values(event).returning();
    return result[0];
  }

  async getSecurityEvents(userId: string, limit = 50): Promise<SecurityEvent[]> {
    return db.select().from(securityEvents).where(eq(securityEvents.userId, userId)).orderBy(desc(securityEvents.createdAt)).limit(limit);
  }

  async getAllSecurityEvents(limit = 100): Promise<SecurityEvent[]> {
    return db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(limit);
  }

  async createSmsDelivery(delivery: InsertSmsDelivery): Promise<SmsDelivery> {
    const result = await db.insert(smsDeliveries).values(delivery).returning();
    return result[0];
  }

  async updateSmsDeliveryStatus(id: string, status: string, errorCode?: string, errorMessage?: string): Promise<void> {
    await db.update(smsDeliveries).set({ status, errorCode, errorMessage }).where(eq(smsDeliveries.id, id));
  }

  async getSmsDeliveries(userId: string, limit = 50): Promise<SmsDelivery[]> {
    return db.select().from(smsDeliveries).where(eq(smsDeliveries.userId, userId)).orderBy(desc(smsDeliveries.createdAt)).limit(limit);
  }

  async updateUserPhone(userId: string, phoneNumber: string): Promise<void> {
    await db.update(users).set({ phoneNumber, phoneVerifiedAt: null }).where(eq(users.id, userId));
  }

  async verifyUserPhone(userId: string): Promise<void> {
    await db.update(users).set({ phoneVerifiedAt: new Date() }).where(eq(users.id, userId));
  }

  async enableTwoFactor(userId: string, method = 'sms'): Promise<void> {
    await db.update(users).set({ twoFactorEnabled: true, twoFactorMethod: method }).where(eq(users.id, userId));
  }

  async enableTwoFactorSms(userId: string, phoneNumber: string): Promise<void> {
    await db.update(users).set({ phoneNumber, twoFactorEnabled: true, twoFactorMethod: 'sms' }).where(eq(users.id, userId));
  }

  async disableTwoFactor(userId: string): Promise<void> {
    await db.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, userId));
  }

  async getW2Records(userId: string, environment: string): Promise<W2Record[]> {
    return db.select().from(w2Records).where(
      and(eq(w2Records.userId, userId), eq(w2Records.environment, environment))
    ).orderBy(desc(w2Records.createdAt));
  }

  async createW2Record(record: InsertW2Record): Promise<W2Record> {
    const result = await db.insert(w2Records).values(record).returning();
    return result[0];
  }

  async getW2Record(id: string): Promise<W2Record | undefined> {
    const result = await db.select().from(w2Records).where(eq(w2Records.id, id));
    return result[0];
  }

  async updateW2Record(id: string, update: Partial<W2Record>): Promise<W2Record | undefined> {
    const result = await db.update(w2Records).set(update).where(eq(w2Records.id, id)).returning();
    return result[0];
  }

  async deleteW2Record(id: string): Promise<void> {
    await db.delete(w2Records).where(eq(w2Records.id, id));
  }

  async resetDemoEnvironment(): Promise<void> {
    // Demo reset logic handled by specialized service
  }

  async getFireflyConnection(userId: string, environment: string): Promise<FireflyConnection | undefined> {
    const result = await db.select().from(fireflyConnections).where(
      and(eq(fireflyConnections.userId, userId), eq(fireflyConnections.environment, environment))
    );
    return result[0];
  }

  async createFireflyConnection(connection: InsertFireflyConnection): Promise<FireflyConnection> {
    const result = await db.insert(fireflyConnections).values(connection).returning();
    return result[0];
  }

  async updateFireflyConnection(id: string, updates: Partial<FireflyConnection>): Promise<FireflyConnection | undefined> {
    const result = await db.update(fireflyConnections).set(updates).where(eq(fireflyConnections.id, id)).returning();
    return result[0];
  }

  async deleteFireflyConnection(id: string): Promise<void> {
    await db.delete(fireflyConnections).where(eq(fireflyConnections.id, id));
  }

  async createFireflySyncLog(log: InsertFireflySyncLog): Promise<FireflySyncLog> {
    const result = await db.insert(fireflySyncLogs).values(log).returning();
    return result[0];
  }

  async updateFireflySyncLog(id: string, updates: Partial<FireflySyncLog>): Promise<FireflySyncLog | undefined> {
    const result = await db.update(fireflySyncLogs).set(updates).where(eq(fireflySyncLogs.id, id)).returning();
    return result[0];
  }

  async getFireflySyncLogs(connectionId: string, limit = 50): Promise<FireflySyncLog[]> {
    return db.select().from(fireflySyncLogs).where(eq(fireflySyncLogs.connectionId, connectionId)).orderBy(desc(fireflySyncLogs.syncedAt)).limit(limit);
  }

  async getFireflySyncLogBySourceId(sourceType: string, sourceId: string): Promise<FireflySyncLog | undefined> {
    const result = await db.select().from(fireflySyncLogs).where(
      and(eq(fireflySyncLogs.sourceType, sourceType), eq(fireflySyncLogs.sourceId, sourceId))
    );
    return result[0];
  }
}

export const storage = new DatabaseStorage();
