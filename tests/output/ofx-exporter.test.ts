import { describe, it, expect } from 'vitest';
import { exportOfx, exportAccountOfx, exportOfxByAccount } from '@findata/output';
import type { FinalResultV2 } from '@findata/output';

const createMockV2Result = (): FinalResultV2 => ({
  schemaVersion: 'v2',
  startingBalance: 1000,
  endingBalance: 1150,
  totalStatements: 1,
  totalTransactions: 2,
  analytics: {
    quarterlyCashFlow: [],
    incomeVsExpenses: {
      totalIncome: 200,
      totalExpenses: 50,
      netIncome: 150,
      incomeByCategory: {},
      expensesByCategory: {},
      excludedTransfers: 0,
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
    },
    lenderSummary: {
      averageMonthlyIncome: 200,
      averageMonthlyExpenses: 50,
      monthlyIncomeVariance: 0,
      incomeStabilityScore: 100,
      consecutiveMonthsWithIncome: 1,
      totalMonthsAnalyzed: 1,
      monthlyBreakdown: [],
      incomeSourceDiversity: 1,
      regularIncomeDetected: true,
      estimatedAnnualIncome: 2400,
    },
    taxPreparation: {
      taxYear: 2025,
      totalTaxableIncome: 200,
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
  integrity: {
    overallValid: true,
    statementsChecked: 1,
    statementsWithIssues: 0,
    statementResults: [],
    summary: {
      totalDiscrepancies: 0,
      totalDelta: 0,
      warnings: [],
      epsilon: 0.01,
    },
  },
  accounts: [
    {
      account: {
        institution: 'Bank of America',
        accountType: 'checking',
        accountNumberMasked: '****3529',
        statementPeriod: {
          start: '2025-01-01',
          end: '2025-01-31',
        },
        currency: 'USD',
      },
      summary: {
        startingBalance: 1000,
        endingBalance: 1150,
        totalCredits: 200,
        totalDebits: 50,
      },
      transactions: [
        {
          date: '2025-01-15',
          postedDate: '2025-01-16',
          description: 'Direct Deposit ACME Corp',
          merchant: 'ACME Corp',
          amount: 200,
          direction: 'credit',
          category: 'Income',
          subcategory: 'Salary',
          confidence: 0.95,
          statementId: 'BOA-checking-****3529-2025-01-01-2025-01-31',
          periodLabel: '2025-01 BOA Checking',
          transactionId: 'tx_abcdef1234567890abcdef12',
          raw: {
            originalText: '01/15 01/16 Direct Deposit ACME Corp 200.00',
            page: 1,
          },
        },
        {
          date: '2025-01-20',
          postedDate: null,
          description: 'CHECKCARD 0120 AMAZON MKTPLACE',
          merchant: 'Amazon',
          amount: -50,
          direction: 'debit',
          category: 'Shopping',
          subcategory: 'Online',
          confidence: 0.9,
          statementId: 'BOA-checking-****3529-2025-01-01-2025-01-31',
          periodLabel: '2025-01 BOA Checking',
          transactionId: 'tx_123456789012345678901234',
          raw: {
            originalText: '01/20 CHECKCARD 0120 AMAZON MKTPLACE -50.00',
            page: 2,
          },
        },
      ],
      totalStatements: 1,
      totalTransactions: 2,
    },
  ],
});

describe('ofx-exporter', () => {
  describe('exportOfx', () => {
    it('should generate valid OFX structure', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      expect(ofx).toContain('<?xml version="1.0"');
      expect(ofx).toContain('<OFX>');
      expect(ofx).toContain('</OFX>');
      expect(ofx).toContain('<BANKMSGSRSV1>');
      expect(ofx).toContain('</BANKMSGSRSV1>');
    });

    it('should include account information', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      expect(ofx).toContain('<BANKACCTFROM>');
      expect(ofx).toContain('<ACCTTYPE>CHECKING</ACCTTYPE>');
      expect(ofx).toContain('<CURDEF>USD</CURDEF>');
    });

    it('should use numeric ACCTID (replace * with 0)', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      // ****3529 should become 00003529
      expect(ofx).toContain('<ACCTID>00003529</ACCTID>');
      expect(ofx).not.toContain('XXXX');
      expect(ofx).not.toContain('****');
    });

    it('should generate unique TRNUID based on statement period', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      // Format: stmt_YYYYMMDD_YYYYMMDD_ACCT
      expect(ofx).toContain('<TRNUID>stmt_20250101_20250131_3529</TRNUID>');
      expect(ofx).not.toContain('<TRNUID>0</TRNUID>');
    });

    it('should include transactions with FITID', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      expect(ofx).toContain('<STMTTRN>');
      expect(ofx).toContain('<FITID>tx_abcdef1234567890abcdef12</FITID>');
      expect(ofx).toContain('<FITID>tx_123456789012345678901234</FITID>');
    });

    it('should format credit amounts as positive with specific TRNTYPE', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      // "Direct Deposit" maps to DEP type
      expect(ofx).toContain('<TRNTYPE>DEP</TRNTYPE>');
      expect(ofx).toContain('<TRNAMT>200.00</TRNAMT>');
    });

    it('should format debit amounts as negative with specific TRNTYPE', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      // "CHECKCARD" maps to POS type
      expect(ofx).toContain('<TRNTYPE>POS</TRNTYPE>');
      expect(ofx).toContain('<TRNAMT>-50.00</TRNAMT>');
    });

    it('should format dates as YYYYMMDD', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      expect(ofx).toContain('<DTPOSTED>20250116</DTPOSTED>');
      expect(ofx).toContain('<DTSTART>20250101</DTSTART>');
      expect(ofx).toContain('<DTEND>20250131</DTEND>');
    });

    it('should use date when postedDate is null', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      // Second transaction has null postedDate, should use date
      expect(ofx).toContain('<DTPOSTED>20250120</DTPOSTED>');
    });

    it('should include ledger balance', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      expect(ofx).toContain('<LEDGERBAL>');
      expect(ofx).toContain('<BALAMT>1150.00</BALAMT>');
    });

    it('should be deterministic (same input = same output)', () => {
      const v2Result = createMockV2Result();
      const ofx1 = exportOfx(v2Result);
      const ofx2 = exportOfx(v2Result);

      // Remove DTSERVER which contains current timestamp
      const normalize = (ofx: string) => ofx.replace(/<DTSERVER>\d+<\/DTSERVER>/g, '<DTSERVER>X</DTSERVER>');
      
      expect(normalize(ofx1)).toBe(normalize(ofx2));
    });

    it('should exclude header when requested', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result, { includeHeader: false });

      expect(ofx).not.toContain('<?xml');
      expect(ofx).not.toContain('<OFX>');
      expect(ofx).toContain('<STMTTRNRS>');
    });

    it('should use custom bank ID', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result, { bankId: '999999999' });

      expect(ofx).toContain('<BANKID>999999999</BANKID>');
    });
  });

  describe('exportAccountOfx', () => {
    it('should export single account', () => {
      const v2Result = createMockV2Result();
      const accountBlock = v2Result.accounts[0];
      
      if (accountBlock === undefined) {
        throw new Error('Test setup error: no account block');
      }

      const ofx = exportAccountOfx(accountBlock);

      expect(ofx).toContain('<OFX>');
      expect(ofx).toContain('<STMTTRNRS>');
      expect(ofx).toContain('</OFX>');
    });
  });

  describe('OFX snapshot', () => {
    it('should match expected OFX structure', () => {
      const v2Result = createMockV2Result();
      const ofx = exportOfx(v2Result);

      // Verify key structural elements are in correct order
      const stmtTrnStart = ofx.indexOf('<STMTTRN>');
      const fitIdStart = ofx.indexOf('<FITID>');
      const stmtTrnEnd = ofx.indexOf('</STMTTRN>');

      expect(stmtTrnStart).toBeLessThan(fitIdStart);
      expect(fitIdStart).toBeLessThan(stmtTrnEnd);
    });
  });

  describe('TRNTYPE detection', () => {
    it('should detect ATM transactions', () => {
      const v2Result = createMockV2Result();
      v2Result.accounts[0]!.transactions[0]!.description = 'ATM WITHDRAWAL';
      const ofx = exportOfx(v2Result);
      expect(ofx).toContain('<TRNTYPE>ATM</TRNTYPE>');
    });

    it('should detect XFER for Zelle transactions', () => {
      const v2Result = createMockV2Result();
      v2Result.accounts[0]!.transactions[0]!.description = 'ZELLE PAYMENT TO JOHN';
      const ofx = exportOfx(v2Result);
      expect(ofx).toContain('<TRNTYPE>XFER</TRNTYPE>');
    });

    it('should detect XFER for transfers', () => {
      const v2Result = createMockV2Result();
      v2Result.accounts[0]!.transactions[0]!.description = 'Online Banking transfer from SAV';
      const ofx = exportOfx(v2Result);
      expect(ofx).toContain('<TRNTYPE>XFER</TRNTYPE>');
    });

    it('should detect FEE for fee transactions', () => {
      const v2Result = createMockV2Result();
      v2Result.accounts[0]!.transactions[1]!.description = 'Monthly Maintenance Fee';
      const ofx = exportOfx(v2Result);
      expect(ofx).toContain('<TRNTYPE>FEE</TRNTYPE>');
    });

    it('should detect CHECK and extract CHECKNUM', () => {
      const v2Result = createMockV2Result();
      v2Result.accounts[0]!.transactions[1]!.description = 'CHECK #1234';
      const ofx = exportOfx(v2Result);
      expect(ofx).toContain('<TRNTYPE>CHECK</TRNTYPE>');
      expect(ofx).toContain('<CHECKNUM>1234</CHECKNUM>');
    });

    it('should detect PAYMENT for ACH transactions', () => {
      const v2Result = createMockV2Result();
      v2Result.accounts[0]!.transactions[1]!.description = 'ACH PAYMENT TO UTILITY';
      const ofx = exportOfx(v2Result);
      expect(ofx).toContain('<TRNTYPE>PAYMENT</TRNTYPE>');
    });

    it('should detect INT for interest', () => {
      const v2Result = createMockV2Result();
      v2Result.accounts[0]!.transactions[0]!.description = 'INTEREST PAYMENT';
      const ofx = exportOfx(v2Result);
      expect(ofx).toContain('<TRNTYPE>INT</TRNTYPE>');
    });
  });

  describe('exportOfxByAccount', () => {
    it('should split accounts into separate results', () => {
      const v2Result = createMockV2Result();
      // Add a second account
      v2Result.accounts.push({
        ...v2Result.accounts[0]!,
        account: {
          ...v2Result.accounts[0]!.account,
          accountType: 'savings',
          accountNumberMasked: '****4971',
        },
      });

      const results = exportOfxByAccount(v2Result);

      expect(results).toHaveLength(2);
      expect(results[0]!.accountType).toBe('checking');
      expect(results[0]!.accountLast4).toBe('3529');
      expect(results[0]!.filename).toBe('boa_checking_3529.ofx');
      expect(results[1]!.accountType).toBe('savings');
      expect(results[1]!.accountLast4).toBe('4971');
      expect(results[1]!.filename).toBe('boa_savings_4971.ofx');
    });

    it('should generate valid OFX content for each account', () => {
      const v2Result = createMockV2Result();
      const results = exportOfxByAccount(v2Result);

      expect(results[0]!.content).toContain('<OFX>');
      expect(results[0]!.content).toContain('<ACCTTYPE>CHECKING</ACCTTYPE>');
      expect(results[0]!.content).toContain('</OFX>');
    });
  });
});
