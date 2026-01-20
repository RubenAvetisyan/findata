import { describe, it, expect } from 'vitest';
import {
  getStatementKey,
  getTransactionKey,
  mergeStatements,
  mergeStatementsWithSources,
  recalculateSummary,
  calculateCompletenessScore,
  resolveStatementDuplicate,
  isCombinedPdfFilename,
  type StatementWithSource,
} from '../../src/utils/statement-merger.js';
import type { ParsedStatement, Transaction } from '../../src/schemas/index.js';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    date: '2025-03-15',
    postedDate: null,
    description: 'Test transaction',
    merchant: 'Test Merchant',
    amount: -50.00,
    direction: 'debit',
    category: 'Shopping',
    subcategory: 'General',
    confidence: 0.85,
    raw: {
      originalText: 'Test transaction -50.00',
      page: 1,
    },
    ...overrides,
  };
}

function createMockStatement(overrides: Partial<ParsedStatement> = {}): ParsedStatement {
  return {
    account: {
      institution: 'Bank of America',
      accountType: 'checking',
      accountNumberMasked: '****1234',
      statementPeriod: {
        start: '2025-03-01',
        end: '2025-03-31',
      },
      currency: 'USD',
    },
    summary: {
      startingBalance: 100.00,
      endingBalance: 50.00,
      totalCredits: 0,
      totalDebits: 50.00,
    },
    transactions: [createMockTransaction()],
    metadata: {
      parserVersion: '1.0.0',
      parsedAt: new Date().toISOString(),
      warnings: [],
    },
    ...overrides,
  };
}

describe('statement-merger', () => {
  describe('getStatementKey', () => {
    it('should generate key from account type, account number and period', () => {
      const statement = createMockStatement();
      const key = getStatementKey(statement);
      expect(key).toBe('checking|****1234|2025-03-01|2025-03-31');
    });

    it('should generate different keys for different periods', () => {
      const stmt1 = createMockStatement();
      const stmt2 = createMockStatement({
        account: {
          ...stmt1.account,
          statementPeriod: { start: '2025-04-01', end: '2025-04-30' },
        },
      });
      
      expect(getStatementKey(stmt1)).not.toBe(getStatementKey(stmt2));
    });

    it('should generate different keys for different accounts', () => {
      const stmt1 = createMockStatement();
      const stmt2 = createMockStatement({
        account: {
          ...stmt1.account,
          accountNumberMasked: '****5678',
        },
      });
      
      expect(getStatementKey(stmt1)).not.toBe(getStatementKey(stmt2));
    });
  });

  describe('getTransactionKey', () => {
    it('should generate key from date, amount, direction, and description', () => {
      const txn = createMockTransaction({
        date: '2025-03-15',
        amount: -50.00,
        description: 'Test Purchase',
        direction: 'debit',
      });
      const key = getTransactionKey(txn);
      expect(key).toBe('2025-03-15|-50|debit|test purchase');
    });

    it('should normalize description to lowercase', () => {
      const txn1 = createMockTransaction({ description: 'TEST PURCHASE' });
      const txn2 = createMockTransaction({ description: 'test purchase' });
      
      expect(getTransactionKey(txn1)).toBe(getTransactionKey(txn2));
    });

    it('should generate different keys for different amounts', () => {
      const txn1 = createMockTransaction({ amount: -50.00 });
      const txn2 = createMockTransaction({ amount: -75.00 });
      
      expect(getTransactionKey(txn1)).not.toBe(getTransactionKey(txn2));
    });
  });

  describe('mergeStatements', () => {
    it('should merge statements from multiple arrays', () => {
      const stmt1 = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
        },
      });
      const stmt2 = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-02-01', end: '2025-02-28' },
        },
      });
      
      const result = mergeStatements([[stmt1], [stmt2]]);
      
      expect(result.statements).toHaveLength(2);
      expect(result.duplicateStatementsRemoved).toBe(0);
    });

    it('should remove duplicate statements', () => {
      const stmt1 = createMockStatement();
      const stmt2 = createMockStatement(); // Same period = duplicate
      
      const result = mergeStatements([[stmt1], [stmt2]]);
      
      expect(result.statements).toHaveLength(1);
      expect(result.duplicateStatementsRemoved).toBe(1);
    });

    it('should keep statement with more transactions when duplicates exist', () => {
      const stmt1 = createMockStatement({
        transactions: [createMockTransaction()],
      });
      const stmt2 = createMockStatement({
        transactions: [
          createMockTransaction({ description: 'Txn 1' }),
          createMockTransaction({ description: 'Txn 2' }),
          createMockTransaction({ description: 'Txn 3' }),
        ],
      });
      
      const result = mergeStatements([[stmt1], [stmt2]]);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0]?.transactions.length).toBe(3);
    });

    it('should sort statements by period start date', () => {
      const march = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-03-01', end: '2025-03-31' },
        },
      });
      const january = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
        },
      });
      const february = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-02-01', end: '2025-02-28' },
        },
      });
      
      const result = mergeStatements([[march], [january], [february]]);
      
      expect(result.statements[0]?.account.statementPeriod.start).toBe('2025-01-01');
      expect(result.statements[1]?.account.statementPeriod.start).toBe('2025-02-01');
      expect(result.statements[2]?.account.statementPeriod.start).toBe('2025-03-01');
    });

    it('should dedupe transactions within statements', () => {
      const txn = createMockTransaction();
      const stmt = createMockStatement({
        transactions: [txn, txn, txn], // Same transaction 3 times
      });
      
      const result = mergeStatements([[stmt]]);
      
      expect(result.statements[0]?.transactions).toHaveLength(1);
      expect(result.duplicateTransactionsRemoved).toBe(2);
    });

    it('should calculate correct total transactions', () => {
      const stmt1 = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
        },
        transactions: [
          createMockTransaction({ description: 'Txn 1' }),
          createMockTransaction({ description: 'Txn 2' }),
        ],
      });
      const stmt2 = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-02-01', end: '2025-02-28' },
        },
        transactions: [
          createMockTransaction({ description: 'Txn 3' }),
        ],
      });
      
      const result = mergeStatements([[stmt1], [stmt2]]);
      
      expect(result.totalTransactions).toBe(3);
    });

    it('should handle empty input arrays', () => {
      const result = mergeStatements([]);
      
      expect(result.statements).toHaveLength(0);
      expect(result.totalTransactions).toBe(0);
    });
  });

  describe('recalculateSummary', () => {
    it('should calculate totals from transactions', () => {
      const stmt = createMockStatement({
        transactions: [
          createMockTransaction({ amount: 100, direction: 'credit' }),
          createMockTransaction({ amount: -50, direction: 'debit' }),
          createMockTransaction({ amount: -25, direction: 'debit' }),
        ],
        summary: {
          startingBalance: 0,
          endingBalance: 25,
          totalCredits: 0,
          totalDebits: 0,
        },
      });
      
      recalculateSummary(stmt);
      
      expect(stmt.summary.totalCredits).toBe(100);
      expect(stmt.summary.totalDebits).toBe(75);
    });

    it('should handle statements with no transactions', () => {
      const stmt = createMockStatement({
        transactions: [],
        summary: {
          startingBalance: 100,
          endingBalance: 100,
          totalCredits: 0,
          totalDebits: 0,
        },
      });
      
      recalculateSummary(stmt);
      
      expect(stmt.summary.totalCredits).toBe(0);
      expect(stmt.summary.totalDebits).toBe(0);
    });
  });

  describe('calculateCompletenessScore', () => {
    it('should score higher for more transactions', () => {
      const stmt1 = createMockStatement({
        transactions: [createMockTransaction()],
      });
      const stmt2 = createMockStatement({
        transactions: [
          createMockTransaction({ description: 'Txn 1' }),
          createMockTransaction({ description: 'Txn 2' }),
          createMockTransaction({ description: 'Txn 3' }),
        ],
      });
      
      expect(calculateCompletenessScore(stmt2)).toBeGreaterThan(calculateCompletenessScore(stmt1));
    });

    it('should score higher for non-zero totals', () => {
      const stmt1 = createMockStatement({
        summary: { startingBalance: 0, endingBalance: 0, totalCredits: 0, totalDebits: 0 },
      });
      const stmt2 = createMockStatement({
        summary: { startingBalance: 100, endingBalance: 50, totalCredits: 200, totalDebits: 250 },
      });
      
      expect(calculateCompletenessScore(stmt2)).toBeGreaterThan(calculateCompletenessScore(stmt1));
    });

    it('should penalize warnings', () => {
      const stmt1 = createMockStatement({
        metadata: { parserVersion: '1.0.0', parsedAt: new Date().toISOString(), warnings: [] },
      });
      const stmt2 = createMockStatement({
        metadata: { parserVersion: '1.0.0', parsedAt: new Date().toISOString(), warnings: ['Warning 1', 'Warning 2'] },
      });
      
      expect(calculateCompletenessScore(stmt1)).toBeGreaterThan(calculateCompletenessScore(stmt2));
    });
  });

  describe('isCombinedPdfFilename', () => {
    it('should detect combined PDF filenames', () => {
      expect(isCombinedPdfFilename('BOA_All_Statements_Combined.pdf')).toBe(true);
      expect(isCombinedPdfFilename('merged-statements.pdf')).toBe(true);
      expect(isCombinedPdfFilename('all_statements_2025.pdf')).toBe(true);
      expect(isCombinedPdfFilename('AllStatements.pdf')).toBe(true);
    });

    it('should not detect regular statement filenames', () => {
      expect(isCombinedPdfFilename('eStmt_2025-03-10.pdf')).toBe(false);
      expect(isCombinedPdfFilename('statement_march_2025.pdf')).toBe(false);
      expect(isCombinedPdfFilename('BOA_March_2025.pdf')).toBe(false);
    });
  });

  describe('resolveStatementDuplicate', () => {
    function wrapWithSource(stmt: ParsedStatement, sourceFile: string, isCombined = false): StatementWithSource {
      return { statement: stmt, sourceFile, isCombinedPdf: isCombined };
    }

    it('should prefer statement with higher completeness score', () => {
      const lessComplete = createMockStatement({
        transactions: [createMockTransaction()],
      });
      const moreComplete = createMockStatement({
        transactions: [
          createMockTransaction({ description: 'Txn 1' }),
          createMockTransaction({ description: 'Txn 2' }),
          createMockTransaction({ description: 'Txn 3' }),
        ],
      });
      
      const result = resolveStatementDuplicate(
        wrapWithSource(lessComplete, 'a.pdf'),
        wrapWithSource(moreComplete, 'b.pdf')
      );
      
      expect(result.statement.transactions.length).toBe(3);
    });

    it('should prefer standalone PDF over combined PDF when scores are equal', () => {
      const stmt = createMockStatement();
      const fromCombined = wrapWithSource(stmt, 'combined.pdf', true);
      const fromStandalone = wrapWithSource(stmt, 'standalone.pdf', false);
      
      const result = resolveStatementDuplicate(fromCombined, fromStandalone);
      
      expect(result.sourceFile).toBe('standalone.pdf');
    });

    it('should use lexicographic filename as final tie-breaker', () => {
      const stmt = createMockStatement();
      const fileA = wrapWithSource(stmt, 'a_statement.pdf', false);
      const fileB = wrapWithSource(stmt, 'b_statement.pdf', false);
      
      const result = resolveStatementDuplicate(fileB, fileA);
      
      expect(result.sourceFile).toBe('a_statement.pdf');
    });
  });

  describe('mergeStatementsWithSources', () => {
    function wrapWithSource(stmt: ParsedStatement, sourceFile: string, isCombined = false): StatementWithSource {
      return { statement: stmt, sourceFile, isCombinedPdf: isCombined };
    }

    it('should dedupe statements from combined and standalone PDFs', () => {
      const marchStmt = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-03-01', end: '2025-03-31' },
        },
        transactions: [
          createMockTransaction({ description: 'Txn 1' }),
          createMockTransaction({ description: 'Txn 2' }),
        ],
      });
      
      // Same statement from combined PDF (with fewer transactions)
      const marchFromCombined = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-03-01', end: '2025-03-31' },
        },
        transactions: [createMockTransaction({ description: 'Txn 1' })],
      });
      
      const result = mergeStatementsWithSources([
        [wrapWithSource(marchFromCombined, 'combined.pdf', true)],
        [wrapWithSource(marchStmt, 'march_2025.pdf', false)],
      ]);
      
      // Should keep the standalone with more transactions
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0]?.transactions.length).toBe(2);
      expect(result.duplicateStatementsRemoved).toBe(1);
    });

    it('should handle combined PDF with multiple statements overlapping individual PDFs', () => {
      const jan = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
        },
      });
      const feb = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-02-01', end: '2025-02-28' },
        },
      });
      const mar = createMockStatement({
        account: {
          ...createMockStatement().account,
          statementPeriod: { start: '2025-03-01', end: '2025-03-31' },
        },
      });
      
      // Combined PDF has all three
      const combinedStatements = [
        wrapWithSource(jan, 'combined.pdf', true),
        wrapWithSource(feb, 'combined.pdf', true),
        wrapWithSource(mar, 'combined.pdf', true),
      ];
      
      // Individual PDFs for Jan and Feb
      const individualStatements = [
        wrapWithSource(jan, 'jan_2025.pdf', false),
        wrapWithSource(feb, 'feb_2025.pdf', false),
      ];
      
      const result = mergeStatementsWithSources([combinedStatements, individualStatements]);
      
      // Should have exactly 3 unique statements
      expect(result.statements).toHaveLength(3);
      expect(result.duplicateStatementsRemoved).toBe(2);
    });
  });
});
