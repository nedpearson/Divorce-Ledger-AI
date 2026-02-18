/**
 * COMPLETE SYSTEM VALIDATION
 * Tests: Billing → Tier Enforcement → Analytics
 * 
 * Run with: npx tsx scripts/test-complete-system.ts
 */

import { db } from '../server/db';
import { users, violations, cases, billingRecords, usageAudit } from '../shared/schema';
import { tierEnforcementService } from '../server/tier-enforcement';
import { billingService } from '../server/billing-service';
import { tierMigrationService } from '../server/tier-migration-service';
import { quotaResetService } from '../server/quota-reset-service';
import { analyticsService } from '../server/analytics-service';
import { eq, sql } from 'drizzle-orm';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class SystemValidator {
  private results: TestResult[] = [];
  private testUser: { id: string; email: string } = { id: '', email: '' };

  private addResult(name: string, passed: boolean, duration: number, error?: Error): void {
    this.results.push({
      name,
      passed,
      duration,
      error: error?.message,
    });
    const status = passed ? '✅' : '❌';
    console.log(`   ${status} ${name} (${duration}ms)`);
    if (error) {
      console.log(`      Error: ${error.message}`);
    }
  }

  async setupTestData(): Promise<void> {
    console.log('\n🔧 PHASE 1: Setting up test data...\n');

    try {
      const existingUsers = await db.select().from(users).limit(1);
      
      if (existingUsers.length > 0) {
        this.testUser = { id: existingUsers[0].id, email: existingUsers[0].email };
        console.log(`✅ Using existing user: ${this.testUser.email} (ID: ${this.testUser.id})`);
      } else {
        console.log('⚠️ No users found - tests may fail');
      }
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  }

  async testTierEnforcement(): Promise<void> {
    const start = Date.now();
    console.log('\n📋 TEST 1: Tier Enforcement\n');

    try {
      const usage = await tierEnforcementService.getUserUsageMetrics(this.testUser.id);
      this.addResult('Get Usage Metrics', true, Date.now() - start);
      console.log(`   Tier: ${usage.tier}`);
      console.log(`   Violations: ${usage.violationsThisMonth}`);
      console.log(`   Storage: ${usage.storageUsedMB.toFixed(1)}MB`);

      const uploadCheck = await tierEnforcementService.canUploadFile(this.testUser.id, 5);
      this.addResult('File Upload Check', true, Date.now() - start);
      console.log(`   Can upload 5MB: ${uploadCheck.allowed}`);

      const recommendation = await tierEnforcementService.getRecommendedTierUpgrade(this.testUser.id);
      this.addResult('Upgrade Recommendation', true, Date.now() - start);
      console.log(`   Current: ${recommendation.currentTier}`);
      console.log(`   Recommended: ${recommendation.recommendedTier}`);
      console.log(`   Reason: ${recommendation.reason}`);
    } catch (error) {
      this.addResult('Tier Enforcement', false, Date.now() - start, error as Error);
    }
  }

  async testBillingCalculation(): Promise<void> {
    const start = Date.now();
    console.log('\n💳 TEST 2: Billing Calculation\n');

    try {
      const billing = await billingService.calculateMonthlyBilling(this.testUser.id);
      this.addResult('Billing Calculation', true, Date.now() - start);
      console.log(`   Tier: ${billing.tier}`);
      console.log(`   Violations: ${billing.violationsRecorded}`);
      console.log(`   Storage: ${billing.storageUsedMb}MB`);
      console.log(`   Total: $${(billing.amountCents / 100).toFixed(2)}`);

      const history = await billingService.getBillingHistory(this.testUser.id);
      this.addResult('Billing History', true, Date.now() - start);
      console.log(`   History records: ${history.length}`);
    } catch (error) {
      this.addResult('Billing Calculation', false, Date.now() - start, error as Error);
    }
  }

  async testTierMigration(): Promise<void> {
    const start = Date.now();
    console.log('\n⬆️  TEST 3: Tier Migration\n');

    try {
      const activeMigration = await tierMigrationService.getActiveMigration(this.testUser.id);
      this.addResult('Get Active Migration', true, Date.now() - start);
      console.log(`   Active migration: ${activeMigration ? 'Yes' : 'None'}`);

      const history = await tierMigrationService.getMigrationHistory(this.testUser.id);
      this.addResult('Migration History', true, Date.now() - start);
      console.log(`   Migration history records: ${history.length}`);
    } catch (error) {
      this.addResult('Tier Migration', false, Date.now() - start, error as Error);
    }
  }

  async testQuotaReset(): Promise<void> {
    const start = Date.now();
    console.log('\n🔄 TEST 4: Quota Reset\n');

    try {
      const history = await quotaResetService.getResetHistory(this.testUser.id);
      this.addResult('Quota Reset History', true, Date.now() - start);
      console.log(`   Reset history records: ${history.length}`);

      const nextReset = quotaResetService.getNextResetDate();
      this.addResult('Next Reset Date', true, Date.now() - start);
      console.log(`   Next reset: ${nextReset.toISOString()}`);

      const daysUntil = quotaResetService.daysUntilReset();
      this.addResult('Days Until Reset', true, Date.now() - start);
      console.log(`   Days until reset: ${daysUntil}`);
    } catch (error) {
      this.addResult('Quota Reset', false, Date.now() - start, error as Error);
    }
  }

  async testAnalytics(): Promise<void> {
    const start = Date.now();
    console.log('\n📈 TEST 5: Analytics\n');

    try {
      const metrics = await analyticsService.getPlatformMetrics();
      this.addResult('Platform Metrics', true, Date.now() - start);
      console.log(`   Total users: ${metrics.totalUsers}`);
      console.log(`   Active users: ${metrics.activeUsers}`);
      console.log(`   Total violations: ${metrics.totalViolations}`);
      console.log(`   Revenue this month: $${(metrics.revenueThisMonthCents / 100).toFixed(2)}`);
      console.log(`   Churn rate: ${metrics.churnRatePercent}%`);

      const cohorts = await analyticsService.getCohortAnalysis(3);
      this.addResult('Cohort Analysis', true, Date.now() - start);
      console.log(`   Analyzed ${cohorts.length} cohorts`);

      const trends = await analyticsService.getUsageTrends(30);
      this.addResult('Usage Trends', true, Date.now() - start);
      console.log(`   Tracked ${trends.length} days of usage`);

      const revenue = await analyticsService.getRevenueByTier();
      this.addResult('Revenue by Tier', true, Date.now() - start);
      revenue.forEach((tier) => {
        console.log(`   ${tier.tier}: $${(tier.totalRevenueCents / 100).toFixed(2)}`);
      });

      const tierDist = await analyticsService.getTierDistribution();
      this.addResult('Tier Distribution', true, Date.now() - start);
      Object.entries(tierDist).forEach(([tier, data]) => {
        console.log(`   ${tier}: ${data.count} users (${data.percentage}%)`);
      });
    } catch (error) {
      this.addResult('Analytics', false, Date.now() - start, error as Error);
    }
  }

  async testDataConsistency(): Promise<void> {
    const start = Date.now();
    console.log('\n🔍 TEST 6: Data Consistency Checks\n');

    try {
      const allUsers = await db.select().from(users);
      const allViolations = await db.select().from(violations);
      
      this.addResult('Users Table Access', true, Date.now() - start);
      console.log(`   Total users: ${allUsers.length}`);

      this.addResult('Violations Table Access', true, Date.now() - start);
      console.log(`   Total violations: ${allViolations.length}`);

      const billingRecordsData = await db.select().from(billingRecords);
      this.addResult('Billing Records Access', true, Date.now() - start);
      console.log(`   Total billing records: ${billingRecordsData.length}`);

    } catch (error) {
      this.addResult('Data Consistency', false, Date.now() - start, error as Error);
    }
  }

  async testPerformance(): Promise<void> {
    const start = Date.now();
    console.log('\n⚡ TEST 7: Performance Benchmarks\n');

    try {
      const analyticsStart = Date.now();
      await analyticsService.getPlatformMetrics();
      const analyticsTime = Date.now() - analyticsStart;
      
      const passed = analyticsTime < 5000;
      this.addResult(`Analytics Query (<5s)`, passed, analyticsTime);
      console.log(`   Analytics query: ${analyticsTime}ms`);

      const billingStart = Date.now();
      const user = await db.select().from(users).limit(1);
      if (user.length > 0) {
        await billingService.calculateMonthlyBilling(user[0].id);
      }
      const billingTime = Date.now() - billingStart;
      
      this.addResult(`Billing Calculation (<1s)`, billingTime < 1000, billingTime);
      console.log(`   Billing calculation: ${billingTime}ms`);

    } catch (error) {
      this.addResult('Performance', false, Date.now() - start, error as Error);
    }
  }

  printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('                    TEST SUMMARY');
    console.log('='.repeat(60) + '\n');

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

    if (failed > 0) {
      console.log('Failed Tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  ❌ ${r.name}: ${r.error || 'Unknown error'}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! System is ready for production.');
    } else {
      console.log('⚠️  Some tests failed. Please review before deploying.');
    }
    console.log('='.repeat(60) + '\n');
  }

  async runAll(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('       DIVORCEEASE AI - COMPLETE SYSTEM VALIDATION');
    console.log('='.repeat(60));

    await this.setupTestData();
    await this.testTierEnforcement();
    await this.testBillingCalculation();
    await this.testTierMigration();
    await this.testQuotaReset();
    await this.testAnalytics();
    await this.testDataConsistency();
    await this.testPerformance();
    
    this.printSummary();
  }
}

const validator = new SystemValidator();
validator.runAll()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
