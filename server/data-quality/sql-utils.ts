const VALID_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function escapeIdentifier(identifier: string): string {
  if (!VALID_IDENTIFIER_REGEX.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function escapeTableName(table: string): string {
  const parts = table.split('.');
  if (parts.length > 2) {
    throw new Error(`Invalid table name: ${table}`);
  }
  return parts.map(escapeIdentifier).join('.');
}

export function isDemoMode(): boolean {
  return !process.env.DATABASE_URL;
}

export function createDemoResult(message: string): any {
  return {
    passed: true,
    actualValue: 'demo_mode',
    expectedValue: 'demo_mode',
    message: `[Demo Mode] ${message}`,
  };
}
