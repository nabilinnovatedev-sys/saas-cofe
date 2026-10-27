import { describe, expect, it } from 'vitest';
import { loyaltyError, loyaltyPhone, loyaltyProgress } from './loyalty';

describe('loyalty phones', () => {
  it.each(['0612345678', '+212 612-345-678', '00212 (612) 345678'])('normalizes %s', phone => expect(loyaltyPhone(phone)).toBe('212612345678'));
  it('keeps international numbers', () => expect(loyaltyPhone('+33 6 12 34 56 78')).toBe('33612345678'));
  it.each(['', '0123', 'abc0612345678', '+212612345678<script>', '0'.repeat(20)])('rejects %s', phone => expect(() => loyaltyPhone(phone)).toThrow('INVALID_PHONE'));
});
describe('loyalty balances', () => {
  it('shows remaining points', () => expect(loyaltyProgress(3, 10)).toEqual({ goal: 10, balance: 3, rewards: 0, filled: 3, remaining: 7 }));
  it('retains surplus and multiple rewards', () => expect(loyaltyProgress(23, 10)).toEqual({ goal: 10, balance: 23, rewards: 2, filled: 10, remaining: 0 }));
  it('bounds preview inputs', () => expect(loyaltyProgress(-2, 1000)).toEqual({ goal: 100, balance: 0, rewards: 0, filled: 0, remaining: 100 }));
  it('does not expose raw server errors', () => expect(loyaltyError(new Error('database password secret'))).not.toContain('secret'));
  it('explains recovery without claiming phone verified', () => expect(loyaltyError(new Error('{"error":"STAFF_RECOVERY_REQUIRED"}'))).toContain('serveur'));
});
