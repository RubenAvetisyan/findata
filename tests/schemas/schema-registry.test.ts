import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSchema,
  getSchemaPath,
  isValidSchemaVersion,
  assertValidSchemaVersion,
  validateSchemaOutput as validateOutput,
  validateOutputOrThrow,
  resolveSchemaVersion,
  AVAILABLE_SCHEMA_VERSIONS,
  DEFAULT_SCHEMA_VERSION,
  type SchemaVersion,
} from '@findata/types';

describe('schema-registry', () => {
  describe('AVAILABLE_SCHEMA_VERSIONS', () => {
    it('should include v1 and v2', () => {
      expect(AVAILABLE_SCHEMA_VERSIONS).toContain('v1');
      expect(AVAILABLE_SCHEMA_VERSIONS).toContain('v2');
    });

    it('should have v1 as default', () => {
      expect(DEFAULT_SCHEMA_VERSION).toBe('v1');
    });
  });

  describe('getSchemaPath', () => {
    it('should return path for v1 schema', () => {
      const path = getSchemaPath('v1');
      expect(path).toContain('final_result.v1.schema.json');
    });

    it('should return path for v2 schema', () => {
      const path = getSchemaPath('v2');
      expect(path).toContain('final_result.v2.schema.json');
    });
  });

  describe('getSchema', () => {
    it('should load v1 schema', () => {
      const schema = getSchema('v1');
      expect(schema).toBeDefined();
      expect(schema).toHaveProperty('$schema');
      expect(schema).toHaveProperty('title');
    });

    it('should load v2 schema', () => {
      const schema = getSchema('v2');
      expect(schema).toBeDefined();
      expect(schema).toHaveProperty('$schema');
      expect(schema).toHaveProperty('title');
    });

    it('should throw for invalid version', () => {
      expect(() => getSchema('v99' as SchemaVersion)).toThrow('Invalid schema version');
    });
  });

  describe('isValidSchemaVersion', () => {
    it('should return true for v1', () => {
      expect(isValidSchemaVersion('v1')).toBe(true);
    });

    it('should return true for v2', () => {
      expect(isValidSchemaVersion('v2')).toBe(true);
    });

    it('should return false for invalid versions', () => {
      expect(isValidSchemaVersion('v3')).toBe(false);
      expect(isValidSchemaVersion('invalid')).toBe(false);
      expect(isValidSchemaVersion('')).toBe(false);
    });
  });

  describe('assertValidSchemaVersion', () => {
    it('should not throw for valid versions', () => {
      expect(() => assertValidSchemaVersion('v1')).not.toThrow();
      expect(() => assertValidSchemaVersion('v2')).not.toThrow();
    });

    it('should throw for invalid versions', () => {
      expect(() => assertValidSchemaVersion('v3')).toThrow('Invalid schema version');
      expect(() => assertValidSchemaVersion('invalid')).toThrow('Available versions: v1, v2');
    });
  });

  describe('resolveSchemaVersion', () => {
    const originalEnv = process.env['FINAL_RESULT_SCHEMA_VERSION'];

    beforeEach(() => {
      delete process.env['FINAL_RESULT_SCHEMA_VERSION'];
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env['FINAL_RESULT_SCHEMA_VERSION'] = originalEnv;
      } else {
        delete process.env['FINAL_RESULT_SCHEMA_VERSION'];
      }
    });

    it('should return default v1 when no options provided', () => {
      expect(resolveSchemaVersion({})).toBe('v1');
    });

    it('should prioritize CLI version over env and config', () => {
      process.env['FINAL_RESULT_SCHEMA_VERSION'] = 'v1';
      expect(resolveSchemaVersion({ cliVersion: 'v2', configVersion: 'v1' })).toBe('v2');
    });

    it('should use env variable when CLI not provided', () => {
      process.env['FINAL_RESULT_SCHEMA_VERSION'] = 'v2';
      expect(resolveSchemaVersion({})).toBe('v2');
    });

    it('should use config when CLI and env not provided', () => {
      expect(resolveSchemaVersion({ configVersion: 'v2' })).toBe('v2');
    });

    it('should throw for invalid CLI version', () => {
      expect(() => resolveSchemaVersion({ cliVersion: 'v99' })).toThrow('Invalid schema version');
    });

    it('should throw for invalid env version', () => {
      process.env['FINAL_RESULT_SCHEMA_VERSION'] = 'invalid';
      expect(() => resolveSchemaVersion({})).toThrow('Invalid schema version');
    });

    it('should throw for invalid config version', () => {
      expect(() => resolveSchemaVersion({ configVersion: 'bad' })).toThrow('Invalid schema version');
    });
  });

  describe('validateOutput', () => {
    const validV1Output = {
      schemaVersion: 'v1',
      statements: [],
      totalStatements: 0,
      totalTransactions: 0,
    };

    const validV2Output = {
      schemaVersion: 'v2',
      startingBalance: 0,
      endingBalance: 100,
      totalStatements: 1,
      totalTransactions: 2,
      integrity: {
        overallValid: true,
        statementsChecked: 1,
        statementsWithIssues: 0,
        statementResults: [
          {
            statementId: 'CHECKING-1234-20250101-20250131',
            periodLabel: '2025-01 BOA Checking',
            isValid: true,
            balanceCheck: {
              passed: true,
              beginningBalance: 0,
              endingBalance: 100,
              totalCredits: 100,
              totalDebits: 0,
              calculatedEnding: 100,
              delta: 0,
            },
            transactionCheck: {
              passed: true,
              expectedCount: 2,
              actualCount: 2,
            },
            discrepancies: [],
          },
        ],
        summary: {
          totalDiscrepancies: 0,
          totalDelta: 0,
          warnings: [],
        },
      },
      analytics: {
        quarterlyCashFlow: [
          {
            quarter: '2025-Q1',
            year: 2025,
            quarterNumber: 1,
            startDate: '2025-01-01',
            endDate: '2025-03-31',
            totalIncome: 100,
            totalExpenses: 50,
            netCashFlow: 50,
            transactionCount: 2,
          },
        ],
        incomeVsExpenses: {
          totalIncome: 100,
          totalExpenses: 50,
          netIncome: 50,
          incomeByCategory: { Income: 100 },
          expensesByCategory: { Shopping: 50 },
          excludedTransfers: 0,
          periodStart: '2025-01-15',
          periodEnd: '2025-01-20',
        },
        lenderSummary: {
          averageMonthlyIncome: 100,
          averageMonthlyExpenses: 50,
          monthlyIncomeVariance: 0,
          incomeStabilityScore: 100,
          consecutiveMonthsWithIncome: 1,
          totalMonthsAnalyzed: 1,
          monthlyBreakdown: [
            { month: '2025-01', income: 100, expenses: 50, netCashFlow: 50 },
          ],
          incomeSourceDiversity: 1,
          regularIncomeDetected: false,
          estimatedAnnualIncome: 1200,
        },
        taxPreparation: {
          taxYear: 2025,
          totalTaxableIncome: 100,
          totalDeductibleExpenses: 0,
          potentialDeductions: [],
          incomeCategories: [],
          reviewRequired: [],
          summary: {
            businessExpenses: 0,
            medicalExpenses: 0,
            charitableContributions: 0,
            homeOffice: 0,
            professionalServices: 0,
            otherDeductible: 0,
          },
        },
      },
      accounts: [
        {
          account: {
            institution: 'Bank of America',
            accountType: 'checking',
            accountNumberMasked: '****1234',
            statementPeriod: { start: '2025-01-01', end: '2025-01-31' },
            currency: 'USD',
          },
          summary: {
            startingBalance: 0,
            endingBalance: 100,
            totalCredits: 100,
            totalDebits: 0,
          },
          transactions: [
            {
              date: '2025-01-15',
              postedDate: null,
              description: 'Test deposit',
              merchant: 'Test Merchant',
              amount: 100,
              direction: 'credit',
              category: 'Income',
              subcategory: 'Salary',
              confidence: 0.95,
              statementId: 'CHECKING-1234-20250101-20250131',
              periodLabel: '2025-01 BOA Checking',
              raw: { originalText: 'Test deposit 100.00', page: 1 },
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
              statementId: 'CHECKING-1234-20250101-20250131',
              periodLabel: '2025-01 BOA Checking',
              raw: { originalText: 'Test purchase -50.00', page: 1 },
            },
          ],
          totalStatements: 1,
          totalTransactions: 2,
        },
      ],
    };

    it('should validate valid v1 output', () => {
      const result = validateOutput('v1', validV1Output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid v2 output', () => {
      const result = validateOutput('v2', validV2Output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid v1 output', () => {
      const result = validateOutput('v1', { invalid: true });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid v2 output', () => {
      const result = validateOutput('v2', { invalid: true });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject v2 output with missing required fields', () => {
      const result = validateOutput('v2', {
        startingBalance: 0,
        // missing other required fields
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateOutputOrThrow', () => {
    it('should not throw for valid output', () => {
      const validOutput = {
        schemaVersion: 'v1',
        statements: [],
        totalStatements: 0,
        totalTransactions: 0,
      };
      expect(() => validateOutputOrThrow('v1', validOutput)).not.toThrow();
    });

    it('should throw for invalid output with error details', () => {
      expect(() => validateOutputOrThrow('v1', { bad: 'data' })).toThrow(
        'Schema validation failed'
      );
    });
  });
});
