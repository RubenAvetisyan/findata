import { describe, it, expect } from 'vitest';
import {
  checkIntegrity,
  checkStatementIntegrity,
  DEFAULT_EPSILON,
} from '../../src/output/integrity.js';
import type { ParsedStatement } from '../../src/schemas/index.js';

const createMockStatement = (overrides: Partial<{
  startingBalance: number;
  endingBalance: number;
  totalCredits: number;
  totalDebits: number;
}> = {}): ParsedStatement => ({
  account: {
    institution: 'Bank of America',
    accountType: 'checking',
    accountNumberMasked: '****1234',
    statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
    currency: 'USD',
  },
  summary: {
    startingBalance: overrides.startingBalance ?? 1000,
    endingBalance: overrides.endingBalance ?? 1150,
    totalCredits: overrides.totalCredits ?? 200,
    totalDebits: overrides.totalDebits ?? 50,
  },
  transactions: [
    {
      date: '2025-01-15',
      postedDate: null,
      description: 'Test deposit',
      merchant: 'Test',
      amount: 200,
      direction: 'credit',
      category: 'Income',
      subcategory: 'Salary',
      confidence: 0.95,
      raw: { originalText: 'Test deposit 200.00', page: 1 },
    },
    {
      date: '2025-01-20',
      postedDate: null,
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
  },
});

describe('integrity', () => {
  describe('DEFAULT_EPSILON', () => {
    it('should be 0.01', () => {
      expect(DEFAULT_EPSILON).toBe(0.01);
    });
  });

  describe('checkStatementIntegrity', () => {
    it('should pass when balance equation is exact', () => {
      // 1000 + 200 - 50 = 1150
      const stmt = createMockStatement();
      const result = checkStatementIntegrity(stmt);

      expect(result.isValid).toBe(true);
      expect(result.balanceCheck.passed).toBe(true);
      expect(result.balanceCheck.delta).toBe(0);
      expect(result.discrepancies).toHaveLength(0);
    });

    it('should pass when delta is within epsilon', () => {
      // 1000 + 200 - 50 = 1150, but ending is 1150.005 (within 0.01)
      const stmt = createMockStatement({ endingBalance: 1150.005 });
      const result = checkStatementIntegrity(stmt);

      expect(result.isValid).toBe(true);
      expect(result.balanceCheck.passed).toBe(true);
    });

    it('should fail when delta exceeds epsilon', () => {
      // 1000 + 200 - 50 = 1150, but ending is 1150.50 (delta = 0.50)
      const stmt = createMockStatement({ endingBalance: 1150.50 });
      const result = checkStatementIntegrity(stmt);

      expect(result.isValid).toBe(false);
      expect(result.balanceCheck.passed).toBe(false);
      expect(result.balanceCheck.delta).toBe(0.50);
      expect(result.discrepancies).toHaveLength(1);
    });

    it('should use custom epsilon', () => {
      // 1000 + 200 - 50 = 1150, ending is 1150.50
      const stmt = createMockStatement({ endingBalance: 1150.50 });
      
      // With default epsilon (0.01), should fail
      const result1 = checkStatementIntegrity(stmt);
      expect(result1.isValid).toBe(false);

      // With larger epsilon (1.00), should pass
      const result2 = checkStatementIntegrity(stmt, 1.00);
      expect(result2.isValid).toBe(true);
    });

    it('should set severity to warning for delta <= $1.00', () => {
      const stmt = createMockStatement({ endingBalance: 1150.75 });
      const result = checkStatementIntegrity(stmt);

      expect(result.discrepancies[0]?.severity).toBe('warning');
    });

    it('should set severity to error for delta > $1.00', () => {
      const stmt = createMockStatement({ endingBalance: 1152.00 });
      const result = checkStatementIntegrity(stmt);

      expect(result.discrepancies[0]?.severity).toBe('error');
    });

    it('should include statement ID and period label', () => {
      const stmt = createMockStatement();
      const result = checkStatementIntegrity(stmt);

      expect(result.statementId).toContain('BOA');
      expect(result.statementId).toContain('checking');
      expect(result.periodLabel).toContain('2025-01');
    });

    it('should include balance equation in discrepancy', () => {
      const stmt = createMockStatement({ endingBalance: 1200 });
      const result = checkStatementIntegrity(stmt);

      const discrepancy = result.discrepancies[0];
      expect(discrepancy?.equation.beginningBalance).toBe(1000);
      expect(discrepancy?.equation.totalCredits).toBe(200);
      expect(discrepancy?.equation.totalDebits).toBe(50);
      expect(discrepancy?.equation.calculatedEnding).toBe(1150);
    });
  });

  describe('checkIntegrity', () => {
    it('should check all statements', () => {
      const statements = [
        createMockStatement(),
        createMockStatement(),
      ];

      const result = checkIntegrity(statements);

      expect(result.statementsChecked).toBe(2);
      expect(result.statementResults).toHaveLength(2);
    });

    it('should set overallValid to true when all pass', () => {
      const statements = [
        createMockStatement(),
        createMockStatement(),
      ];

      const result = checkIntegrity(statements);

      expect(result.overallValid).toBe(true);
      expect(result.statementsWithIssues).toBe(0);
    });

    it('should set overallValid to false when any fail', () => {
      const statements = [
        createMockStatement(),
        createMockStatement({ endingBalance: 9999 }),
      ];

      const result = checkIntegrity(statements);

      expect(result.overallValid).toBe(false);
      expect(result.statementsWithIssues).toBe(1);
    });

    it('should calculate total delta across all discrepancies', () => {
      const statements = [
        createMockStatement({ endingBalance: 1151 }), // delta = 1
        createMockStatement({ endingBalance: 1152 }), // delta = 2
      ];

      const result = checkIntegrity(statements);

      expect(result.summary.totalDelta).toBe(3);
    });

    it('should include epsilon in summary', () => {
      const statements = [createMockStatement()];
      const result = checkIntegrity(statements, 0.05);

      expect(result.summary.epsilon).toBe(0.05);
    });

    it('should add warnings for issues', () => {
      const statements = [
        createMockStatement({ endingBalance: 1200 }),
      ];

      const result = checkIntegrity(statements);

      expect(result.summary.warnings.length).toBeGreaterThan(0);
      expect(result.summary.warnings[0]).toContain('discrepancies');
    });

    it('should handle empty statements array', () => {
      const result = checkIntegrity([]);

      expect(result.overallValid).toBe(true);
      expect(result.statementsChecked).toBe(0);
      expect(result.statementResults).toHaveLength(0);
    });
  });
});
