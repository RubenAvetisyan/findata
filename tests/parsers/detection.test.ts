import { describe, it, expect } from 'vitest';
import { detectAccountType } from '@findata/boa-parser';
import type { ExtractedPDF } from '@findata/pdf-extract';

const createMockPDF = (text: string): ExtractedPDF => ({
  pages: [{ pageNumber: 1, text, lines: text.split('\n') }],
  fullText: text,
  totalPages: 1,
  metadata: {},
});

describe('detectAccountType', () => {
  it('should detect checking account', () => {
    const pdf = createMockPDF(`
      Bank of America
      Checking Account Statement
      Beginning balance: $1,000.00
      Ending balance: $1,500.00
      Deposits and other additions
      Withdrawals and other subtractions
      Daily ending balance
    `);

    expect(detectAccountType(pdf)).toBe('checking');
  });

  it('should detect savings account by Advantage Savings header', () => {
    const pdf = createMockPDF(`
      Bank of America
      Your Bank of America Advantage Savings
      for February 21, 2025 to March 21, 2025
      Beginning balance: $1,000.00
      Ending balance: $1,500.00
      Deposits and other additions
      Other subtractions
    `);

    expect(detectAccountType(pdf)).toBe('savings');
  });

  it('should detect savings account by interest indicators', () => {
    const pdf = createMockPDF(`
      Bank of America
      Account Statement
      Beginning balance: $1,000.00
      Ending balance: $1,500.00
      Deposits and other additions
      Other subtractions
      Interest Earned
      Annual Percentage Yield Earned
    `);

    expect(detectAccountType(pdf)).toBe('savings');
  });

  it('should detect credit card account', () => {
    const pdf = createMockPDF(`
      Bank of America
      Credit Card Statement
      Card Member Services
      Minimum payment due: $25.00
      Credit limit: $5,000.00
      Available credit: $4,500.00
      Purchase APR: 19.99%
    `);

    expect(detectAccountType(pdf)).toBe('credit');
  });

  it('should return unknown for ambiguous statements', () => {
    const pdf = createMockPDF(`
      Bank of America
      Account Statement
      Balance: $1,000.00
    `);

    expect(detectAccountType(pdf)).toBe('unknown');
  });
});
