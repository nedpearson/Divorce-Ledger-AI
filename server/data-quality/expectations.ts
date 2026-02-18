import { getPool } from '../db';
import { escapeIdentifier, escapeTableName, isDemoMode, createDemoResult } from './sql-utils';
import { safeQuery } from '../lib/safeQuery';

export type ExpectationType = 
  | 'not_null'
  | 'unique' 
  | 'in_set'
  | 'between'
  | 'regex'
  | 'min_length'
  | 'max_length'
  | 'referential_integrity'
  | 'row_count_range'
  | 'column_exists'
  | 'freshness'
  | 'custom_sql';

export interface Expectation {
  name: string;
  type: ExpectationType;
  table: string;
  column?: string;
  parameters: Record<string, any>;
  severity: 'info' | 'warning' | 'critical';
}

export interface ExpectationResult {
  expectation: Expectation;
  passed: boolean;
  actualValue: string;
  expectedValue: string;
  message: string;
  metadata?: Record<string, any>;
}

export class ExpectationSuite {
  private expectations: Expectation[] = [];
  private name: string;
  private targetSystem: string;

  constructor(name: string, targetSystem: 'app' | 'warehouse' | 'quickbooks') {
    this.name = name;
    this.targetSystem = targetSystem;
  }

  expectColumnValuesToNotBeNull(table: string, column: string, severity: 'info' | 'warning' | 'critical' = 'warning'): this {
    this.expectations.push({
      name: `${table}.${column}_not_null`,
      type: 'not_null',
      table,
      column,
      parameters: {},
      severity
    });
    return this;
  }

  expectColumnValuesToBeUnique(table: string, column: string, severity: 'info' | 'warning' | 'critical' = 'warning'): this {
    this.expectations.push({
      name: `${table}.${column}_unique`,
      type: 'unique',
      table,
      column,
      parameters: {},
      severity
    });
    return this;
  }

  expectColumnValuesToBeInSet(table: string, column: string, valueSet: any[], severity: 'info' | 'warning' | 'critical' = 'warning'): this {
    this.expectations.push({
      name: `${table}.${column}_in_set`,
      type: 'in_set',
      table,
      column,
      parameters: { valueSet },
      severity
    });
    return this;
  }

  expectColumnValuesToBeBetween(table: string, column: string, minValue: number, maxValue: number, severity: 'info' | 'warning' | 'critical' = 'warning'): this {
    this.expectations.push({
      name: `${table}.${column}_between`,
      type: 'between',
      table,
      column,
      parameters: { minValue, maxValue },
      severity
    });
    return this;
  }

  expectColumnValuesToMatchRegex(table: string, column: string, regex: string, severity: 'info' | 'warning' | 'critical' = 'warning'): this {
    this.expectations.push({
      name: `${table}.${column}_regex`,
      type: 'regex',
      table,
      column,
      parameters: { regex },
      severity
    });
    return this;
  }

  expectColumnStringLengthToBeBetween(table: string, column: string, minLength: number, maxLength: number, severity: 'info' | 'warning' | 'critical' = 'warning'): this {
    this.expectations.push({
      name: `${table}.${column}_length`,
      type: 'min_length',
      table,
      column,
      parameters: { minLength, maxLength },
      severity
    });
    return this;
  }

  expectReferentialIntegrity(table: string, column: string, referencedTable: string, referencedColumn: string, severity: 'info' | 'warning' | 'critical' = 'critical'): this {
    this.expectations.push({
      name: `${table}.${column}_ref_${referencedTable}`,
      type: 'referential_integrity',
      table,
      column,
      parameters: { referencedTable, referencedColumn },
      severity
    });
    return this;
  }

  expectTableRowCountToBeBetween(table: string, minCount: number, maxCount: number, severity: 'info' | 'warning' | 'critical' = 'warning'): this {
    this.expectations.push({
      name: `${table}_row_count`,
      type: 'row_count_range',
      table,
      parameters: { minCount, maxCount },
      severity
    });
    return this;
  }

  expectColumnToExist(table: string, column: string, severity: 'info' | 'warning' | 'critical' = 'critical'): this {
    this.expectations.push({
      name: `${table}.${column}_exists`,
      type: 'column_exists',
      table,
      column,
      parameters: {},
      severity
    });
    return this;
  }

  expectDataFreshness(table: string, timestampColumn: string, maxAgeMinutes: number, severity: 'info' | 'warning' | 'critical' = 'warning'): this {
    this.expectations.push({
      name: `${table}_freshness`,
      type: 'freshness',
      table,
      column: timestampColumn,
      parameters: { maxAgeMinutes },
      severity
    });
    return this;
  }

  expectCustomSql(name: string, table: string, sql: string, expectedResult: any, severity: 'info' | 'warning' | 'critical' = 'warning'): this {
    this.expectations.push({
      name,
      type: 'custom_sql',
      table,
      parameters: { sql, expectedResult },
      severity
    });
    return this;
  }

  async validate(): Promise<ExpectationResult[]> {
    const results: ExpectationResult[] = [];

    if (isDemoMode()) {
      for (const exp of this.expectations) {
        results.push({
          expectation: exp,
          ...createDemoResult('Validation skipped in demo mode')
        });
      }
      return results;
    }

    const pool = getPool();

    for (const exp of this.expectations) {
      try {
        const result = await this.evaluateExpectation(pool, exp);
        results.push(result);
      } catch (error: any) {
        results.push({
          expectation: exp,
          passed: false,
          actualValue: 'error',
          expectedValue: 'success',
          message: `Error evaluating expectation: ${error.message}`
        });
      }
    }

    return results;
  }

  private async evaluateExpectation(pool: any, exp: Expectation): Promise<ExpectationResult> {
    switch (exp.type) {
      case 'not_null':
        return this.checkNotNull(pool, exp);
      case 'unique':
        return this.checkUnique(pool, exp);
      case 'in_set':
        return this.checkInSet(pool, exp);
      case 'between':
        return this.checkBetween(pool, exp);
      case 'regex':
        return this.checkRegex(pool, exp);
      case 'min_length':
        return this.checkStringLength(pool, exp);
      case 'referential_integrity':
        return this.checkReferentialIntegrity(pool, exp);
      case 'row_count_range':
        return this.checkRowCount(pool, exp);
      case 'column_exists':
        return this.checkColumnExists(pool, exp);
      case 'freshness':
        return this.checkFreshness(pool, exp);
      case 'custom_sql':
        return this.checkCustomSql(pool, exp);
      default:
        return {
          expectation: exp,
          passed: false,
          actualValue: 'unknown',
          expectedValue: 'valid expectation type',
          message: `Unknown expectation type: ${exp.type}`
        };
    }
  }

  private async checkNotNull(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const table = escapeTableName(exp.table);
    const column = escapeIdentifier(exp.column!);
    
    const result = await safeQuery(
      pool,
      'expectations:notNull',
      `SELECT COUNT(*) as null_count FROM ${table} WHERE ${column} IS NULL`,
      []
    );
    const nullCount = parseInt(result.rows[0].null_count);
    const passed = nullCount === 0;

    return {
      expectation: exp,
      passed,
      actualValue: String(nullCount),
      expectedValue: '0',
      message: passed ? 'All values are non-null' : `Found ${nullCount} null values`
    };
  }

  private async checkUnique(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const table = escapeTableName(exp.table);
    const column = escapeIdentifier(exp.column!);
    
    const result = await safeQuery(
      pool,
      'expectations:unique',
      `SELECT ${column}, COUNT(*) as cnt FROM ${table} 
       GROUP BY ${column} HAVING COUNT(*) > 1 LIMIT 10`,
      []
    );
    const duplicateCount = result.rows.length;
    const passed = duplicateCount === 0;

    return {
      expectation: exp,
      passed,
      actualValue: String(duplicateCount),
      expectedValue: '0',
      message: passed ? 'All values are unique' : `Found ${duplicateCount} duplicate groups`,
      metadata: { duplicates: result.rows }
    };
  }

  private async checkInSet(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const table = escapeTableName(exp.table);
    const column = escapeIdentifier(exp.column!);
    const { valueSet } = exp.parameters;
    const placeholders = valueSet.map((_: any, i: number) => `$${i + 1}`).join(',');
    
    const result = await safeQuery(
      pool,
      'expectations:inSet',
      `SELECT COUNT(*) as invalid_count FROM ${table} 
       WHERE ${column} IS NOT NULL AND ${column}::text NOT IN (${placeholders})`,
      valueSet.map((v: any) => String(v))
    );
    const invalidCount = parseInt(result.rows[0].invalid_count);
    const passed = invalidCount === 0;

    return {
      expectation: exp,
      passed,
      actualValue: String(invalidCount),
      expectedValue: '0',
      message: passed ? 'All values are in the allowed set' : `Found ${invalidCount} values not in set`
    };
  }

  private async checkBetween(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const table = escapeTableName(exp.table);
    const column = escapeIdentifier(exp.column!);
    const { minValue, maxValue } = exp.parameters;
    
    const result = await safeQuery(
      pool,
      'expectations:between',
      `SELECT COUNT(*) as out_of_range FROM ${table} 
       WHERE ${column} IS NOT NULL AND (${column} < $1 OR ${column} > $2)`,
      [minValue, maxValue]
    );
    const outOfRange = parseInt(result.rows[0].out_of_range);
    const passed = outOfRange === 0;

    return {
      expectation: exp,
      passed,
      actualValue: String(outOfRange),
      expectedValue: '0',
      message: passed ? `All values are between ${minValue} and ${maxValue}` : `Found ${outOfRange} values out of range`
    };
  }

  private async checkRegex(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const table = escapeTableName(exp.table);
    const column = escapeIdentifier(exp.column!);
    const { regex } = exp.parameters;
    
    const result = await safeQuery(
      pool,
      'expectations:regex',
      `SELECT COUNT(*) as non_matching FROM ${table} 
       WHERE ${column} IS NOT NULL AND ${column}::text !~ $1`,
      [regex]
    );
    const nonMatching = parseInt(result.rows[0].non_matching);
    const passed = nonMatching === 0;

    return {
      expectation: exp,
      passed,
      actualValue: String(nonMatching),
      expectedValue: '0',
      message: passed ? 'All values match the regex' : `Found ${nonMatching} values not matching pattern`
    };
  }

  private async checkStringLength(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const table = escapeTableName(exp.table);
    const column = escapeIdentifier(exp.column!);
    const { minLength, maxLength } = exp.parameters;
    
    const result = await safeQuery(
      pool,
      'expectations:stringLength',
      `SELECT COUNT(*) as invalid_length FROM ${table} 
       WHERE ${column} IS NOT NULL AND (LENGTH(${column}::text) < $1 OR LENGTH(${column}::text) > $2)`,
      [minLength, maxLength]
    );
    const invalidLength = parseInt(result.rows[0].invalid_length);
    const passed = invalidLength === 0;

    return {
      expectation: exp,
      passed,
      actualValue: String(invalidLength),
      expectedValue: '0',
      message: passed ? `All string lengths are between ${minLength} and ${maxLength}` : `Found ${invalidLength} values with invalid length`
    };
  }

  private async checkReferentialIntegrity(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const table = escapeTableName(exp.table);
    const column = escapeIdentifier(exp.column!);
    const { referencedTable, referencedColumn } = exp.parameters;
    const refTable = escapeTableName(referencedTable);
    const refColumn = escapeIdentifier(referencedColumn);
    
    const result = await safeQuery(
      pool,
      'expectations:referentialIntegrity',
      `SELECT COUNT(*) as orphaned FROM ${table} t
       WHERE t.${column} IS NOT NULL 
       AND NOT EXISTS (SELECT 1 FROM ${refTable} r WHERE r.${refColumn} = t.${column})`,
      []
    );
    const orphaned = parseInt(result.rows[0].orphaned);
    const passed = orphaned === 0;

    return {
      expectation: exp,
      passed,
      actualValue: String(orphaned),
      expectedValue: '0',
      message: passed ? 'Referential integrity maintained' : `Found ${orphaned} orphaned records`
    };
  }

  private async checkRowCount(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const table = escapeTableName(exp.table);
    const { minCount, maxCount } = exp.parameters;
    
    const result = await safeQuery(pool, 'expectations:rowCount', `SELECT COUNT(*) as cnt FROM ${table}`, []);
    const count = parseInt(result.rows[0].cnt);
    const passed = count >= minCount && count <= maxCount;

    return {
      expectation: exp,
      passed,
      actualValue: String(count),
      expectedValue: `${minCount}-${maxCount}`,
      message: passed ? `Row count ${count} is within expected range` : `Row count ${count} is outside expected range`
    };
  }

  private async checkColumnExists(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const result = await safeQuery(
      pool,
      'expectations:columnExists',
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = $1 AND column_name = $2`,
      [exp.table, exp.column]
    );
    const passed = result.rows.length > 0;

    return {
      expectation: exp,
      passed,
      actualValue: passed ? 'exists' : 'missing',
      expectedValue: 'exists',
      message: passed ? `Column ${exp.column} exists` : `Column ${exp.column} does not exist`
    };
  }

  private async checkFreshness(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const table = escapeTableName(exp.table);
    const column = escapeIdentifier(exp.column!);
    const { maxAgeMinutes } = exp.parameters;
    
    const result = await safeQuery(
      pool,
      'expectations:freshness',
      `SELECT MAX(${column}) as latest FROM ${table}`,
      []
    );
    
    if (!result.rows[0].latest) {
      return {
        expectation: exp,
        passed: false,
        actualValue: 'no data',
        expectedValue: `data within ${maxAgeMinutes} minutes`,
        message: 'No data found in table'
      };
    }

    const latest = new Date(result.rows[0].latest);
    const ageMinutes = (Date.now() - latest.getTime()) / 60000;
    const passed = ageMinutes <= maxAgeMinutes;

    return {
      expectation: exp,
      passed,
      actualValue: `${Math.round(ageMinutes)} minutes`,
      expectedValue: `<= ${maxAgeMinutes} minutes`,
      message: passed ? 'Data is fresh' : `Data is ${Math.round(ageMinutes)} minutes old, exceeds ${maxAgeMinutes} minute threshold`
    };
  }

  private async checkCustomSql(pool: any, exp: Expectation): Promise<ExpectationResult> {
    const { sql, expectedResult } = exp.parameters;
    const result = await safeQuery(pool, 'expectations:customSql', sql, []);
    const actualResult = result.rows[0]?.result ?? result.rows[0]?.count ?? result.rows.length;
    const passed = String(actualResult) === String(expectedResult);

    return {
      expectation: exp,
      passed,
      actualValue: String(actualResult),
      expectedValue: String(expectedResult),
      message: passed ? 'Custom SQL check passed' : 'Custom SQL check failed'
    };
  }

  getExpectations(): Expectation[] {
    return this.expectations;
  }

  getName(): string {
    return this.name;
  }

  getTargetSystem(): string {
    return this.targetSystem;
  }
}

export function createAppExpectationSuite(): ExpectationSuite {
  return new ExpectationSuite('app_data_quality', 'app')
    .expectColumnValuesToNotBeNull('users', 'email', 'critical')
    .expectColumnValuesToNotBeNull('users', 'subscription_tier', 'critical')
    .expectColumnValuesToBeUnique('users', 'email', 'critical')
    .expectColumnValuesToBeInSet('users', 'subscription_tier', ['free', 'individual', 'pro', 'team', 'enterprise'], 'critical')
    .expectColumnValuesToBeInSet('users', 'role', ['client', 'attorney', 'cpa', 'admin'], 'warning')
    .expectColumnValuesToNotBeNull('cases', 'user_id', 'critical')
    .expectReferentialIntegrity('cases', 'user_id', 'users', 'id', 'critical')
    .expectColumnValuesToBeInSet('violations', 'status', ['pending', 'reviewed', 'approved'], 'warning')
    .expectColumnValuesToBeBetween('violations', 'severity_score', 1, 10, 'warning')
    .expectReferentialIntegrity('violations', 'user_id', 'users', 'id', 'critical')
    .expectColumnValuesToNotBeNull('transactions', 'amount', 'critical')
    .expectColumnValuesToBeBetween('transactions', 'amount', -1000000000, 1000000000, 'warning')
    .expectReferentialIntegrity('transactions', 'user_id', 'users', 'id', 'critical');
}

export function createWarehouseExpectationSuite(): ExpectationSuite {
  return new ExpectationSuite('warehouse_data_quality', 'warehouse')
    .expectColumnValuesToNotBeNull('dim_users', 'user_id', 'critical')
    .expectColumnValuesToBeUnique('dim_users', 'user_id', 'critical')
    .expectColumnValuesToNotBeNull('dim_date', 'date_id', 'critical')
    .expectColumnValuesToNotBeNull('fact_violations', 'violation_id', 'critical')
    .expectColumnValuesToNotBeNull('fact_violations', 'user_id', 'critical')
    .expectColumnValuesToNotBeNull('fact_transactions', 'source_id', 'critical')
    .expectReferentialIntegrity('fact_violations', 'user_id', 'dim_users', 'user_id', 'critical')
    .expectTableRowCountToBeBetween('dim_date', 365, 3650, 'warning');
}
