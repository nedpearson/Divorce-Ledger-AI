/**
 * DATABASE SCHEMA & CONSTRAINT VALIDATION
 * 
 * Run with: npx tsx scripts/validate-database.ts
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

interface SchemaCheck {
  table: string;
  check: string;
  passed: boolean;
  details?: string;
}

class DatabaseValidator {
  private checks: SchemaCheck[] = [];

  private async query(sqlQuery: string): Promise<any[]> {
    const result = await db.execute(sql.raw(sqlQuery));
    return result.rows as any[];
  }

  async validateTables(): Promise<void> {
    console.log('\n📋 Validating Database Tables...\n');

    const requiredTables = [
      'users',
      'cases',
      'violations',
      'evidence_files',
      'usage_audit',
      'billing_records',
      'tier_migrations',
      'quota_reset_log',
      'transactions',
      'assets',
      'debts',
      'incomes',
      'expenses',
      'alerts',
      'messages',
      'chain_of_custody',
      'teams',
    ];

    for (const table of requiredTables) {
      try {
        const result = await this.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = '${table}'
          ) as exists
        `);

        const exists = result[0]?.exists === true;
        this.checks.push({
          table,
          check: 'Table exists',
          passed: exists,
          details: exists ? 'Found' : 'Missing',
        });

        console.log(`   ${exists ? '✅' : '❌'} ${table}`);
      } catch (error) {
        this.checks.push({
          table,
          check: 'Table exists',
          passed: false,
          details: (error as Error).message,
        });
        console.log(`   ❌ ${table} - Error: ${(error as Error).message}`);
      }
    }
  }

  async validateColumns(): Promise<void> {
    console.log('\n🔑 Validating Key Columns...\n');

    const columnChecks: Record<string, string[]> = {
      users: ['id', 'email', 'subscription_tier', 'violations_count_this_month', 'stripe_customer_id'],
      billing_records: ['id', 'user_id', 'tier', 'amount_cents', 'status'],
      tier_migrations: ['id', 'user_id', 'from_tier', 'to_tier', 'grace_period_days'],
      usage_audit: ['id', 'user_id', 'tier', 'violations_count', 'storage_used_mb'],
      violations: ['id', 'user_id', 'type', 'description', 'timestamp'],
    };

    for (const [table, columns] of Object.entries(columnChecks)) {
      for (const column of columns) {
        try {
          const result = await this.query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = '${table}' AND column_name = '${column}'
            ) as exists
          `);

          const exists = result[0]?.exists === true;
          this.checks.push({
            table,
            check: `Column: ${column}`,
            passed: exists,
          });

          console.log(`   ${exists ? '✅' : '❌'} ${table}.${column}`);
        } catch (error) {
          this.checks.push({
            table,
            check: `Column: ${column}`,
            passed: false,
            details: (error as Error).message,
          });
        }
      }
    }
  }

  async validateDataIntegrity(): Promise<void> {
    console.log('\n🔍 Validating Data Integrity...\n');

    try {
      // Check for users with valid tiers
      const invalidTiers = await this.query(`
        SELECT COUNT(*) as count FROM users 
        WHERE subscription_tier IS NOT NULL 
        AND subscription_tier NOT IN ('free', 'individual', 'pro', 'team', 'enterprise')
      `);

      const invalidTierCount = parseInt(invalidTiers[0]?.count || '0');
      this.checks.push({
        table: 'users',
        check: 'Valid tier values only',
        passed: invalidTierCount === 0,
        details: invalidTierCount > 0 ? `Found ${invalidTierCount} invalid tiers` : 'Valid',
      });
      console.log(`   ${invalidTierCount === 0 ? '✅' : '❌'} Tier value validation`);

      // Check for negative billing amounts
      const negativeBilling = await this.query(`
        SELECT COUNT(*) as count FROM billing_records 
        WHERE amount_cents < 0
      `);

      const negativeCount = parseInt(negativeBilling[0]?.count || '0');
      this.checks.push({
        table: 'billing_records',
        check: 'No negative billing amounts',
        passed: negativeCount === 0,
        details: negativeCount > 0 ? `Found ${negativeCount} negative amounts` : 'Valid',
      });
      console.log(`   ${negativeCount === 0 ? '✅' : '❌'} Billing amount validation`);

      // Check for violations with valid user references
      const orphanedViolations = await this.query(`
        SELECT COUNT(*) as count FROM violations v
        WHERE v.user_id NOT IN (SELECT id FROM users)
      `);

      const orphanedCount = parseInt(orphanedViolations[0]?.count || '0');
      this.checks.push({
        table: 'violations',
        check: 'No orphaned records',
        passed: orphanedCount === 0,
        details: orphanedCount > 0 ? `Found ${orphanedCount} orphaned records` : 'Clean',
      });
      console.log(`   ${orphanedCount === 0 ? '✅' : '❌'} Violations referential integrity`);

      // Check users table has records
      const userCount = await this.query(`SELECT COUNT(*) as count FROM users`);
      const users = parseInt(userCount[0]?.count || '0');
      this.checks.push({
        table: 'users',
        check: 'Has user records',
        passed: users > 0,
        details: `${users} users found`,
      });
      console.log(`   ${users > 0 ? '✅' : '❌'} Users table has records (${users})`);

    } catch (error) {
      console.log(`   ❌ Data integrity check failed: ${(error as Error).message}`);
    }
  }

  async validateConnectionPool(): Promise<void> {
    console.log('\n🔗 Validating Database Connection...\n');

    try {
      const start = Date.now();
      await this.query('SELECT 1');
      const duration = Date.now() - start;

      this.checks.push({
        table: 'connection',
        check: 'Database reachable',
        passed: true,
        details: `${duration}ms response time`,
      });
      console.log(`   ✅ Database connection (${duration}ms)`);

      // Check database version
      const versionResult = await this.query('SELECT version()');
      const version = versionResult[0]?.version || 'Unknown';
      console.log(`   ✅ PostgreSQL version: ${version.split(' ').slice(0, 2).join(' ')}`);

    } catch (error) {
      this.checks.push({
        table: 'connection',
        check: 'Database reachable',
        passed: false,
        details: (error as Error).message,
      });
      console.log(`   ❌ Database connection failed`);
    }
  }

  async validateStorageMetrics(): Promise<void> {
    console.log('\n📊 Validating Storage Metrics...\n');

    try {
      // Count records in key tables
      const tables = ['users', 'violations', 'billing_records', 'tier_migrations', 'usage_audit'];
      
      for (const table of tables) {
        try {
          const result = await this.query(`SELECT COUNT(*) as count FROM ${table}`);
          const count = parseInt(result[0]?.count || '0');
          console.log(`   📁 ${table}: ${count} records`);
        } catch {
          console.log(`   ⚠️  ${table}: Unable to count`);
        }
      }

    } catch (error) {
      console.log(`   ❌ Storage metrics failed: ${(error as Error).message}`);
    }
  }

  private printReport(): void {
    console.log('\n' + '='.repeat(70));
    console.log('                  DATABASE VALIDATION REPORT');
    console.log('='.repeat(70) + '\n');

    const passed = this.checks.filter((c) => c.passed).length;
    const failed = this.checks.filter((c) => !c.passed).length;
    const total = this.checks.length;
    const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;

    console.log(`Total Checks: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${percentage}%\n`);

    if (failed > 0) {
      console.log('Failed Checks:');
      this.checks.filter((c) => !c.passed).forEach((c) => {
        console.log(`  ❌ ${c.table}.${c.check}: ${c.details || 'Failed'}`);
      });
    }

    console.log('\n' + '='.repeat(70));

    if (percentage === 100) {
      console.log('🎉 DATABASE IS READY FOR PRODUCTION!');
    } else if (percentage >= 80) {
      console.log('⚠️  Some checks failed - review before deploying');
    } else {
      console.log('❌ Critical issues found - fix before deploying');
    }
    console.log('='.repeat(70) + '\n');
  }

  async runAll(): Promise<void> {
    console.log('\n' + '='.repeat(70));
    console.log('         DIVORCEEASE AI - DATABASE VALIDATION');
    console.log('='.repeat(70));

    try {
      await this.validateConnectionPool();
      await this.validateTables();
      await this.validateColumns();
      await this.validateDataIntegrity();
      await this.validateStorageMetrics();

      this.printReport();

      const allPassed = this.checks.every((c) => c.passed);
      process.exit(allPassed ? 0 : 1);
    } catch (error) {
      console.error('Database validation failed:', error);
      process.exit(1);
    }
  }
}

const validator = new DatabaseValidator();
validator.runAll();
