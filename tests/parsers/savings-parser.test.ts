import { describe, it, expect } from 'vitest';
import { parseSavingsStatement, parseMultipleSavingsStatements } from '../../src/parsers/boa/savings-parser.js';
import type { ExtractedPDF } from '../../src/extractors/index.js';

const createMockPDF = (text: string, pageCount = 1): ExtractedPDF => {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const cleanText = lines.join('\n');
  return {
    pages: [{ pageNumber: 1, text: cleanText, lines }],
    fullText: cleanText,
    totalPages: pageCount,
    metadata: {},
  };
};

describe('parseSavingsStatement', () => {
  it('should extract account number from savings statement', () => {
    const pdf = createMockPDF(`
      Your Bank of America Advantage Savings
      for February 21, 2025 to March 21, 2025
      Account number: 3252 0425 4971
      Beginning balance on February 21, 2025$1,000.00
      Ending balance on March 21, 2025$1,500.00
    `);

    const result = parseSavingsStatement(pdf);
    expect(result.accountInfo.accountNumberMasked).toBe('****4971');
    expect(result.accountInfo.accountType).toBe('savings');
  });

  it('should extract statement period', () => {
    const pdf = createMockPDF(`
      Your Bank of America Advantage Savings
      for February 21, 2025 to March 21, 2025
      Account number: 3252 0425 4971
      Beginning balance on February 21, 2025$1,000.00
      Ending balance on March 21, 2025$1,500.00
    `);

    const result = parseSavingsStatement(pdf);
    expect(result.accountInfo.statementPeriodStart).toBe('2025-02-21');
    expect(result.accountInfo.statementPeriodEnd).toBe('2025-03-21');
  });

  it('should extract beginning and ending balances', () => {
    const pdf = createMockPDF(`
      Your Bank of America Advantage Savings
      for November 20, 2025 to December 22, 2025
      Account number: 3252 0425 4971
      Beginning balance on November 20, 2025$1,800.02
      Ending balance on December 22, 2025$500.03
    `);

    const result = parseSavingsStatement(pdf);
    expect(result.balanceInfo.startingBalance).toBe(1800.02);
    expect(result.balanceInfo.endingBalance).toBe(500.03);
  });

  it('should parse deposit transactions', () => {
    const pdf = createMockPDF(`
      Your Bank of America Advantage Savings
      for February 21, 2025 to March 21, 2025
      Account number: 3252 0425 4971
      Beginning balance on February 21, 2025$0.00
      Ending balance on March 21, 2025$1,500.00
      Deposits and other additions
      02/21/25 BOFA FIN CTR DEPOSIT200.00
      03/20/25 Online Banking transfer from CHK 3529 1,300.00
      Total deposits and other additions$1,500.00
    `);

    const result = parseSavingsStatement(pdf);
    expect(result.transactions.length).toBe(2);
    expect(result.transactions[0]?.amount).toBe('200.00');
    expect(result.transactions[1]?.amount).toBe('1,300.00');
  });

  it('should parse withdrawal transactions as negative', () => {
    const pdf = createMockPDF(`
      Your Bank of America Advantage Savings
      for November 20, 2025 to December 22, 2025
      Account number: 3252 0425 4971
      Beginning balance on November 20, 2025$1,800.02
      Ending balance on December 22, 2025$500.03
      Other subtractions
      11/24/25 Online Banking transfer to CHK 3529-800.00
      12/05/25 Online Banking transfer to CHK 3529-1,500.00
      Total other subtractions$2,300.00
    `);

    const result = parseSavingsStatement(pdf);
    expect(result.transactions.length).toBe(2);
    expect(result.transactions[0]?.amount).toBe('-800.00');
    expect(result.transactions[1]?.amount).toBe('-1,500.00');
  });

  it('should parse Interest Earned transactions', () => {
    const pdf = createMockPDF(`
      Your Bank of America Advantage Savings
      for November 20, 2025 to December 22, 2025
      Account number: 3252 0425 4971
      Beginning balance on November 20, 2025$1,800.02
      Ending balance on December 22, 2025$1,800.17
      Deposits and other additions
      12/22/25 Interest Earned0.15
      Total deposits and other additions$0.15
    `);

    const result = parseSavingsStatement(pdf);
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0]?.description).toBe('Interest Earned');
    expect(result.transactions[0]?.amount).toBe('0.15');
  });

  it('should handle confirmation numbers in transactions', () => {
    const pdf = createMockPDF(`
      Your Bank of America Advantage Savings
      for February 21, 2025 to March 21, 2025
      Account number: 3252 0425 4971
      Beginning balance on February 21, 2025$0.00
      Ending balance on March 21, 2025$1,300.00
      Deposits and other additions
      03/20/25 Online Banking transfer from CHK 3529 Confirmation# 71453622591,300.00
      Total deposits and other additions$1,300.00
    `);

    const result = parseSavingsStatement(pdf);
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0]?.description).toContain('Confirmation#');
  });
});

describe('parseMultipleSavingsStatements', () => {
  it('should parse single statement from PDF', () => {
    const pdf = createMockPDF(`
      Your Bank of America Advantage Savings
      for February 21, 2025 to March 21, 2025
      Account number: 3252 0425 4971
      Beginning balance on February 21, 2025$0.00
      Ending balance on March 21, 2025$1,500.00
      Deposits and other additions
      02/21/25 BOFA FIN CTR DEPOSIT 200.00
    `);

    const results = parseMultipleSavingsStatements(pdf);
    expect(results.length).toBe(1);
    expect(results[0]?.accountInfo.accountType).toBe('savings');
  });
});
