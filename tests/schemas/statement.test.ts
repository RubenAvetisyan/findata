import { describe, it, expect } from 'vitest';
import {
  ParsedStatementSchema,
  TransactionSchema,
  AccountSchema,
} from '@findata/types';

describe('TransactionSchema', () => {
  it('should validate a valid transaction', () => {
    const transaction = {
      date: '2024-01-15',
      postedDate: null,
      description: 'STARBUCKS STORE 12345',
      merchant: 'STARBUCKS',
      amount: -5.75,
      direction: 'debit',
      category: 'Food & Dining',
      subcategory: 'Restaurants',
      confidence: 0.9,
      raw: {
        originalText: '01/15 STARBUCKS STORE 12345 5.75',
        page: 1,
      },
    };

    const result = TransactionSchema.safeParse(transaction);
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format', () => {
    const transaction = {
      date: '01/15/2024',
      postedDate: null,
      description: 'Test',
      merchant: null,
      amount: 100,
      direction: 'debit',
      category: 'Test',
      subcategory: null,
      confidence: 0.5,
      raw: { originalText: 'test', page: 1 },
    };

    const result = TransactionSchema.safeParse(transaction);
    expect(result.success).toBe(false);
  });

  it('should reject confidence outside 0-1 range', () => {
    const transaction = {
      date: '2024-01-15',
      postedDate: null,
      description: 'Test',
      merchant: null,
      amount: 100,
      direction: 'debit',
      category: 'Test',
      subcategory: null,
      confidence: 1.5,
      raw: { originalText: 'test', page: 1 },
    };

    const result = TransactionSchema.safeParse(transaction);
    expect(result.success).toBe(false);
  });
});

describe('AccountSchema', () => {
  it('should validate a valid account', () => {
    const account = {
      institution: 'Bank of America',
      accountType: 'checking',
      accountNumberMasked: '****1234',
      statementPeriod: {
        start: '2024-01-01',
        end: '2024-01-31',
      },
      currency: 'USD',
    };

    const result = AccountSchema.safeParse(account);
    expect(result.success).toBe(true);
  });

  it('should reject invalid account number format', () => {
    const account = {
      institution: 'Bank of America',
      accountType: 'checking',
      accountNumberMasked: '1234',
      statementPeriod: {
        start: '2024-01-01',
        end: '2024-01-31',
      },
      currency: 'USD',
    };

    const result = AccountSchema.safeParse(account);
    expect(result.success).toBe(false);
  });

  it('should reject invalid institution', () => {
    const account = {
      institution: 'Chase',
      accountType: 'checking',
      accountNumberMasked: '****1234',
      statementPeriod: {
        start: '2024-01-01',
        end: '2024-01-31',
      },
      currency: 'USD',
    };

    const result = AccountSchema.safeParse(account);
    expect(result.success).toBe(false);
  });
});

describe('ParsedStatementSchema', () => {
  it('should validate a complete statement', () => {
    const statement = {
      account: {
        institution: 'Bank of America',
        accountType: 'checking',
        accountNumberMasked: '****1234',
        statementPeriod: {
          start: '2024-01-01',
          end: '2024-01-31',
        },
        currency: 'USD',
      },
      summary: {
        startingBalance: 1000,
        endingBalance: 1500,
        totalCredits: 600,
        totalDebits: 100,
      },
      transactions: [],
      metadata: {
        parserVersion: '1.0.0',
        parsedAt: '2024-01-15T12:00:00.000Z',
        warnings: [],
      },
    };

    const result = ParsedStatementSchema.safeParse(statement);
    expect(result.success).toBe(true);
  });
});
