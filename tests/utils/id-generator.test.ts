import { describe, it, expect } from 'vitest';
import {
  computeStatementId,
  computePeriodLabel,
  computeTransactionId,
  computeTransactionIds,
  isValidTransactionId,
  isValidStatementId,
} from '@findata/types';

describe('id-generator', () => {
  describe('computeStatementId', () => {
    it('should generate deterministic statement ID', () => {
      const statement = {
        account: {
          institution: 'Bank of America',
          accountType: 'checking',
          accountNumberMasked: '****3529',
          statementPeriod: {
            start: '2025-03-11',
            end: '2025-04-09',
          },
        },
      };

      const id1 = computeStatementId(statement);
      const id2 = computeStatementId(statement);

      expect(id1).toBe(id2);
      expect(id1).toBe('BOA-checking-****3529-2025-03-11-2025-04-09');
    });

    it('should normalize institution name', () => {
      const statement = {
        account: {
          institution: '  Bank of America  ',
          accountType: 'savings',
          accountNumberMasked: '****1234',
          statementPeriod: {
            start: '2025-01-01',
            end: '2025-01-31',
          },
        },
      };

      const id = computeStatementId(statement);
      expect(id).toContain('BOA-');
    });

    it('should handle different account types', () => {
      const checking = computeStatementId({
        account: {
          institution: 'Bank of America',
          accountType: 'checking',
          accountNumberMasked: '****1234',
          statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
        },
      });

      const savings = computeStatementId({
        account: {
          institution: 'Bank of America',
          accountType: 'savings',
          accountNumberMasked: '****1234',
          statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
        },
      });

      expect(checking).not.toBe(savings);
      expect(checking).toContain('-checking-');
      expect(savings).toContain('-savings-');
    });
  });

  describe('computePeriodLabel', () => {
    it('should generate single-month label for same month period', () => {
      const statement = {
        account: {
          institution: 'Bank of America',
          accountType: 'checking',
          statementPeriod: {
            start: '2025-03-01',
            end: '2025-03-31',
          },
        },
      };

      const label = computePeriodLabel(statement);
      expect(label).toBe('2025-03 BOA Checking');
    });

    it('should generate range label for multi-month period', () => {
      const statement = {
        account: {
          institution: 'Bank of America',
          accountType: 'savings',
          statementPeriod: {
            start: '2025-01-15',
            end: '2025-02-14',
          },
        },
      };

      const label = computePeriodLabel(statement);
      expect(label).toBe('2025-01-15..2025-02-14 BOA Savings');
    });
  });

  describe('computeTransactionId', () => {
    const baseTransaction = {
      date: '2025-03-15',
      postedDate: '2025-03-16',
      direction: 'debit' as const,
      amount: -50.00,
      description: 'CHECKCARD 0315 AMAZON MKTPLACE',
      merchant: 'Amazon',
      raw: {
        page: 2,
        originalText: '03/15 03/16 CHECKCARD 0315 AMAZON MKTPLACE -50.00',
      },
    };

    const statementId = 'BOA-checking-****3529-2025-03-11-2025-04-09';

    it('should generate deterministic transaction ID', () => {
      const id1 = computeTransactionId(baseTransaction, statementId);
      const id2 = computeTransactionId(baseTransaction, statementId);

      expect(id1).toBe(id2);
    });

    it('should start with tx_ prefix', () => {
      const id = computeTransactionId(baseTransaction, statementId);
      expect(id).toMatch(/^tx_[a-f0-9]{24}$/);
    });

    it('should be exactly 27 characters', () => {
      const id = computeTransactionId(baseTransaction, statementId);
      expect(id.length).toBe(27);
    });

    it('should change when date changes', () => {
      const id1 = computeTransactionId(baseTransaction, statementId);
      const id2 = computeTransactionId(
        { ...baseTransaction, date: '2025-03-16' },
        statementId
      );

      expect(id1).not.toBe(id2);
    });

    it('should change when amount changes', () => {
      const id1 = computeTransactionId(baseTransaction, statementId);
      const id2 = computeTransactionId(
        { ...baseTransaction, amount: -50.01 },
        statementId
      );

      expect(id1).not.toBe(id2);
    });

    it('should change when description changes', () => {
      const id1 = computeTransactionId(baseTransaction, statementId);
      const id2 = computeTransactionId(
        { ...baseTransaction, description: 'CHECKCARD 0315 AMAZON PRIME' },
        statementId
      );

      expect(id1).not.toBe(id2);
    });

    it('should handle null postedDate', () => {
      const txn = { ...baseTransaction, postedDate: null };
      const id = computeTransactionId(txn, statementId);

      expect(id).toMatch(/^tx_[a-f0-9]{24}$/);
    });

    it('should handle null merchant', () => {
      const txn = { ...baseTransaction, merchant: null };
      const id = computeTransactionId(txn, statementId);

      expect(id).toMatch(/^tx_[a-f0-9]{24}$/);
    });
  });

  describe('computeTransactionIds', () => {
    it('should compute IDs for all transactions', () => {
      const transactions = [
        {
          date: '2025-03-15',
          postedDate: null,
          direction: 'credit' as const,
          amount: 100,
          description: 'Deposit',
          merchant: null,
          raw: { page: 1, originalText: 'Deposit 100.00' },
        },
        {
          date: '2025-03-16',
          postedDate: null,
          direction: 'debit' as const,
          amount: -50,
          description: 'Purchase',
          merchant: 'Store',
          raw: { page: 2, originalText: 'Purchase -50.00' },
        },
      ];

      const ids = computeTransactionIds(transactions, 'test-statement-id');

      expect(ids.size).toBe(2);
      expect(ids.get(0)).toMatch(/^tx_[a-f0-9]{24}$/);
      expect(ids.get(1)).toMatch(/^tx_[a-f0-9]{24}$/);
      expect(ids.get(0)).not.toBe(ids.get(1));
    });
  });

  describe('isValidTransactionId', () => {
    it('should validate correct transaction IDs', () => {
      expect(isValidTransactionId('tx_abcdef1234567890abcdef12')).toBe(true);
      expect(isValidTransactionId('tx_000000000000000000000000')).toBe(true);
    });

    it('should reject invalid transaction IDs', () => {
      expect(isValidTransactionId('')).toBe(false);
      expect(isValidTransactionId('abc')).toBe(false);
      expect(isValidTransactionId('tx_short')).toBe(false);
      expect(isValidTransactionId('tx_ABCDEF1234567890ABCDEF12')).toBe(false); // uppercase
      expect(isValidTransactionId('tx_abcdef1234567890abcdef12extra')).toBe(false); // too long
    });
  });

  describe('isValidStatementId', () => {
    it('should validate correct statement IDs', () => {
      expect(isValidStatementId('BOA-checking-****3529-2025-03-11-2025-04-09')).toBe(true);
      expect(isValidStatementId('CHECKING-1234-20250101-20250131')).toBe(true);
    });

    it('should reject invalid statement IDs', () => {
      expect(isValidStatementId('')).toBe(false);
      expect(isValidStatementId('has spaces')).toBe(false);
    });
  });
});
