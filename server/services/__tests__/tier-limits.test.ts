import { expect, test, describe } from 'vitest';
import { canAddViolation } from '../../../shared/tier-utils';
import { type User } from '../../../shared/schema';

describe('Tier Enforcement Logic', () => {
  const mockUser = (tier: string, violations: number): User =>
    ({
      subscriptionTier: tier,
      violationsCountThisMonth: violations,
    }) as User;

  test('should allow additions within limits', () => {
    const user = mockUser('free', 5);
    const result = canAddViolation(user);
    expect(result.allowed).toBe(true);
  });

  test('should block additions at or above limits', () => {
    const user = mockUser('free', 10);
    const result = canAddViolation(user);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('reached your monthly limit');
  });

  test('should respect tier specific limits', () => {
    const user = mockUser('pro', 49);
    const result = canAddViolation(user);
    expect(result.allowed).toBe(true);

    const cappedUser = mockUser('pro', 50);
    const resultCapped = canAddViolation(cappedUser);
    expect(resultCapped.allowed).toBe(false);
  });
});
