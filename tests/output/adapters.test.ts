import { describe, it, expect } from 'vitest';
import {
  toFinalResultV1,
  toFinalResultV2,
  toFinalResult,
  type CanonicalOutput,
} from '../../src/output/adapters.js';
import type { ParsedStatement } from '../../src/schemas/index.js';

const createMockStatement = (overrides: Partial<ParsedStatement> = {}): ParsedStatement => ({
  account: {
    institution: 'Bank of America',
    accountType: 'checking',
    accountNumberMasked: '****1234',
    statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
    currency: 'USD',
    ...overrides.account,
  },
  summary: {
    startingBalance: 100,
    endingBalance: 200,
    totalCredits: 150,
    totalDebits: 50,
    ...overrides.summary,
  },
  transactions: overrides.transactions ?? [
    {
      date: '2025-01-15',
      postedDate: null,
      description: 'Test deposit',
      merchant: 'Test Merchant',
      amount: 150,
      direction: 'credit',
      category: 'Income',
      subcategory: 'Salary',
      confidence: 0.95,
      raw: { originalText: 'Test deposit 150.00', page: 1 },
    },
    {
      date: '2025-01-20',
      postedDate: '2025-01-21',
      description: 'Test purchase',
      merchant: 'Store',
      amount: -50,
      direction: 'debit',
      category: 'Shopping',
      subcategory: null,
      confidence: 0.8,
      raw: { originalText: 'Test purchase -50.00', page: 2 },
    },
  ],
  metadata: {
    parserVersion: '1.0.0',
    parsedAt: '2025-01-31T12:00:00.000Z',
    warnings: [],
    ...overrides.metadata,
  },
});

describe('output adapters', () => {
  describe('toFinalResultV1', () => {
    it('should convert canonical output to v1 format', () => {
      const canonical: CanonicalOutput = {
        statements: [createMockStatement()],
        totalStatements: 1,
        totalTransactions: 2,
      };

      const result = toFinalResultV1(canonical);

      expect(result.statements).toHaveLength(1);
      expect(result.totalStatements).toBe(1);
      expect(result.totalTransactions).toBe(2);
      expect(result.statements[0]?.account.institution).toBe('Bank of America');
      expect(result.statements[0]?.transactions).toHaveLength(2);
    });

    it('should include schemaVersion when requested', () => {
      const canonical: CanonicalOutput = {
        statements: [createMockStatement()],
        totalStatements: 1,
        totalTransactions: 2,
      };

      const result = toFinalResultV1(canonical, true);
      expect(result.schemaVersion).toBe('v1');
    });

    it('should not include schemaVersion by default', () => {
      const canonical: CanonicalOutput = {
        statements: [createMockStatement()],
        totalStatements: 1,
        totalTransactions: 2,
      };

      const result = toFinalResultV1(canonical);
      expect(result.schemaVersion).toBeUndefined();
    });

    it('should include parseErrors when present', () => {
      const canonical: CanonicalOutput = {
        statements: [],
        totalStatements: 0,
        totalTransactions: 0,
        parseErrors: [{ filename: 'test.pdf', error: 'Parse failed' }],
      };

      const result = toFinalResultV1(canonical);
      expect(result.parseErrors).toHaveLength(1);
      expect(result.parseErrors?.[0]?.filename).toBe('test.pdf');
    });

    it('should handle empty statements', () => {
      const canonical: CanonicalOutput = {
        statements: [],
        totalStatements: 0,
        totalTransactions: 0,
      };

      const result = toFinalResultV1(canonical);
      expect(result.statements).toHaveLength(0);
      expect(result.totalStatements).toBe(0);
    });
  });

  describe('toFinalResultV2', () => {
    it('should convert canonical output to v2 rollup format', () => {
      const canonical: CanonicalOutput = {
        statements: [createMockStatement()],
        totalStatements: 1,
        totalTransactions: 2,
      };

      const result = toFinalResultV2(canonical);

      expect(result.schemaVersion).toBe('v2');
      expect(result.accounts).toHaveLength(1);
      expect(result.totalStatements).toBe(1);
      expect(result.totalTransactions).toBe(2);
    });

    it('should calculate rollup balances correctly', () => {
      const canonical: CanonicalOutput = {
        statements: [
          createMockStatement({
            summary: { startingBalance: 100, endingBalance: 200, totalCredits: 150, totalDebits: 50 },
          }),
        ],
        totalStatements: 1,
        totalTransactions: 2,
      };

      const result = toFinalResultV2(canonical);

      expect(result.startingBalance).toBe(100);
      expect(result.endingBalance).toBe(200);
    });

    it('should group statements by account', () => {
      const checkingStmt = createMockStatement({
        account: { 
          institution: 'Bank of America',
          accountType: 'checking', 
          accountNumberMasked: '****1234',
          statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
          currency: 'USD',
        },
      });
      const savingsStmt = createMockStatement({
        account: { 
          institution: 'Bank of America',
          accountType: 'savings', 
          accountNumberMasked: '****5678',
          statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
          currency: 'USD',
        },
      });

      const canonical: CanonicalOutput = {
        statements: [checkingStmt, savingsStmt],
        totalStatements: 2,
        totalTransactions: 4,
      };

      const result = toFinalResultV2(canonical);

      expect(result.accounts).toHaveLength(2);
      expect(result.accounts.map(a => a.account.accountType)).toContain('checking');
      expect(result.accounts.map(a => a.account.accountType)).toContain('savings');
    });

    it('should merge multiple statements for same account', () => {
      const stmt1 = createMockStatement({
        account: { 
          institution: 'Bank of America',
          accountType: 'checking', 
          accountNumberMasked: '****1234',
          statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
          currency: 'USD',
        },
        summary: { startingBalance: 100, endingBalance: 200, totalCredits: 150, totalDebits: 50 },
      });
      const stmt2 = createMockStatement({
        account: { 
          institution: 'Bank of America',
          accountType: 'checking', 
          accountNumberMasked: '****1234',
          statementPeriod: { start: '2025-02-01', end: '2025-02-28' },
          currency: 'USD',
        },
        summary: { startingBalance: 200, endingBalance: 300, totalCredits: 150, totalDebits: 50 },
      });

      const canonical: CanonicalOutput = {
        statements: [stmt1, stmt2],
        totalStatements: 2,
        totalTransactions: 4,
      };

      const result = toFinalResultV2(canonical);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]?.totalStatements).toBe(2);
      expect(result.accounts[0]?.totalTransactions).toBe(4);
      expect(result.accounts[0]?.summary.startingBalance).toBe(100);
      expect(result.accounts[0]?.summary.endingBalance).toBe(300);
    });

    it('should handle null merchant by using "Unknown"', () => {
      const stmt = createMockStatement({
        transactions: [
          {
            date: '2025-01-15',
            postedDate: null,
            description: 'Unknown transaction',
            merchant: null,
            amount: 100,
            direction: 'credit',
            category: 'Uncategorized',
            subcategory: null,
            confidence: 0.5,
            raw: { originalText: 'Unknown 100.00', page: 1 },
          },
        ],
      });

      const canonical: CanonicalOutput = {
        statements: [stmt],
        totalStatements: 1,
        totalTransactions: 1,
      };

      const result = toFinalResultV2(canonical);

      expect(result.accounts[0]?.transactions[0]?.merchant).toBe('Unknown');
    });

    it('should preserve postedDate when present', () => {
      const stmt = createMockStatement({
        transactions: [
          {
            date: '2025-01-15',
            postedDate: '2025-01-16',
            description: 'Posted transaction',
            merchant: 'Merchant',
            amount: 100,
            direction: 'credit',
            category: 'Income',
            subcategory: 'Salary',
            confidence: 0.95,
            raw: { originalText: 'Posted 100.00', page: 1 },
          },
        ],
      });

      const canonical: CanonicalOutput = {
        statements: [stmt],
        totalStatements: 1,
        totalTransactions: 1,
      };

      const result = toFinalResultV2(canonical);

      expect(result.accounts[0]?.transactions[0]?.postedDate).toBe('2025-01-16');
    });

    it('should handle negative amounts correctly', () => {
      const stmt = createMockStatement({
        transactions: [
          {
            date: '2025-01-15',
            postedDate: null,
            description: 'Debit transaction',
            merchant: 'Store',
            amount: -75.50,
            direction: 'debit',
            category: 'Shopping',
            subcategory: 'General Merchandise',
            confidence: 0.85,
            raw: { originalText: 'Debit -75.50', page: 1 },
          },
        ],
      });

      const canonical: CanonicalOutput = {
        statements: [stmt],
        totalStatements: 1,
        totalTransactions: 1,
      };

      const result = toFinalResultV2(canonical);

      expect(result.accounts[0]?.transactions[0]?.amount).toBe(-75.50);
      expect(result.accounts[0]?.transactions[0]?.direction).toBe('debit');
    });
  });

  describe('toFinalResult', () => {
    it('should dispatch to v1 adapter', () => {
      const canonical: CanonicalOutput = {
        statements: [createMockStatement()],
        totalStatements: 1,
        totalTransactions: 2,
      };

      const result = toFinalResult(canonical, 'v1');

      expect(result).toHaveProperty('statements');
      expect(result).toHaveProperty('schemaVersion', 'v1');
    });

    it('should dispatch to v2 adapter', () => {
      const canonical: CanonicalOutput = {
        statements: [createMockStatement()],
        totalStatements: 1,
        totalTransactions: 2,
      };

      const result = toFinalResult(canonical, 'v2');

      expect(result).toHaveProperty('accounts');
      expect(result).toHaveProperty('schemaVersion', 'v2');
    });
  });
});
