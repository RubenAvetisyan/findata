import { describe, it, expect } from 'vitest';
import { validateOutput, validateAndThrow, formatValidationErrors } from '@findata/types';
import type { StatementFileOutput } from '@findata/types';

function createValidOutput(): StatementFileOutput {
  return {
    schemaVersion: '1.0.0',
    source: {
      fileName: 'test-statement.pdf',
      fileType: 'pdf',
      pageCount: 2,
    },
    statements: [
      {
        statementId: '1234567890abcdef1234567890abcdef',
        account: {
          institution: 'Bank of America',
          accountType: 'checking',
          accountNumberMasked: '****5678',
          currency: 'USD',
          statementPeriod: {
            start: '2024-01-01',
            end: '2024-01-31',
          },
        },
        summary: {
          beginningBalance: 1000.00,
          endingBalance: 1150.00,
          totalCredits: 500.00,
          totalDebits: 350.00,
          transactionCount: 5,
        },
        transactions: [
          {
            transactionId: 'abcdef1234567890abcdef1234567890',
            date: '2024-01-05',
            postedDate: null,
            amount: 500.00,
            direction: 'credit',
            description: 'PAYROLL DIRECT DEP ACME CORP',
            descriptionRaw: '01/05 PAYROLL DIRECT DEP ACME CORP 500.00',
            merchant: {
              name: 'ACME CORP',
            },
            bankReference: {},
            channel: {
              type: 'OTHER',
            },
            categorization: {
              category: 'Income',
              subcategory: 'Salary',
              confidence: 0.95,
            },
            raw: {
              page: 1,
              originalText: '01/05 PAYROLL DIRECT DEP ACME CORP 500.00',
            },
          },
        ],
        provenance: {
          extractedFromText: true,
          pageStart: 1,
          pageEnd: 2,
        },
      },
    ],
    metadata: {
      parser: {
        name: 'boa-statement-parser',
        version: '1.0.0',
      },
      parsedAt: new Date().toISOString(),
      warnings: [],
    },
  };
}

describe('AJV Validator', () => {
  describe('validateOutput', () => {
    it('should validate a correct output', () => {
      const output = createValidOutput();
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing schemaVersion', () => {
      const output = createValidOutput() as unknown as Record<string, unknown>;
      delete output.schemaVersion;
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid schemaVersion', () => {
      const output = createValidOutput() as unknown as Record<string, unknown>;
      output.schemaVersion = '2.0.0';
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });

    it('should reject missing statements', () => {
      const output = createValidOutput() as unknown as Record<string, unknown>;
      delete output.statements;
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });

    it('should reject empty statements array', () => {
      const output = createValidOutput();
      output.statements = [];
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid date format', () => {
      const output = createValidOutput();
      output.statements[0]!.account.statementPeriod.start = '01-01-2024' as `${number}-${number}-${number}`;
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid category', () => {
      const output = createValidOutput();
      (output.statements[0]!.transactions[0]!.categorization as Record<string, unknown>).category = 'InvalidCategory';
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid channel type', () => {
      const output = createValidOutput();
      (output.statements[0]!.transactions[0]!.channel as Record<string, unknown>).type = 'INVALID_CHANNEL';
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });

    it('should reject confidence outside 0-1 range', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.categorization.confidence = 1.5;
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });

    it('should reject negative confidence', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.categorization.confidence = -0.1;
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });

    it('should accept valid channel types', () => {
      const validChannels = [
        'CHECKCARD', 'PURCHASE', 'ATM_DEPOSIT', 'ATM_WITHDRAWAL',
        'FINANCIAL_CENTER_DEPOSIT', 'ONLINE_BANKING_TRANSFER',
        'ZELLE', 'CHECK', 'FEE', 'OTHER',
      ];
      
      for (const channelType of validChannels) {
        const output = createValidOutput();
        output.statements[0]!.transactions[0]!.channel.type = channelType as typeof output.statements[0]['transactions'][0]['channel']['type'];
        const result = validateOutput(output);
        expect(result.valid).toBe(true);
      }
    });

    it('should accept valid categories', () => {
      const validCategories = [
        'Income', 'Housing', 'Utilities', 'Transportation', 'Food & Dining',
        'Shopping', 'Entertainment', 'Health', 'Financial', 'Travel',
        'Education', 'Personal Care', 'Insurance', 'Taxes', 'Charity',
        'Pets', 'Childcare', 'Uncategorized',
      ];
      
      for (const category of validCategories) {
        const output = createValidOutput();
        output.statements[0]!.transactions[0]!.categorization.category = category as typeof output.statements[0]['transactions'][0]['categorization']['category'];
        const result = validateOutput(output);
        expect(result.valid).toBe(true);
      }
    });

    it('should accept null postedDate', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.postedDate = null;
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });

    it('should accept valid postedDate', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.postedDate = '2024-01-06';
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });

    it('should reject short statementId', () => {
      const output = createValidOutput();
      output.statements[0]!.statementId = 'short';
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });

    it('should reject short transactionId', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.transactionId = 'short';
      const result = validateOutput(output);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateAndThrow', () => {
    it('should not throw for valid output', () => {
      const output = createValidOutput();
      expect(() => validateAndThrow(output)).not.toThrow();
    });

    it('should throw for invalid output', () => {
      const output = createValidOutput() as unknown as Record<string, unknown>;
      delete output.schemaVersion;
      expect(() => validateAndThrow(output)).toThrow('Schema validation failed');
    });
  });

  describe('formatValidationErrors', () => {
    it('should format errors correctly', () => {
      const output = createValidOutput() as unknown as Record<string, unknown>;
      delete output.schemaVersion;
      const result = validateOutput(output);
      const formatted = formatValidationErrors(result.errors);
      
      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted[0]).toContain('[');
      expect(formatted[0]).toContain(']');
    });
  });

  describe('Bank reference validation', () => {
    it('should accept cardTransactionTraceNumber', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.bankReference.cardTransactionTraceNumber = '24801975260482319110911';
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });

    it('should accept confirmationNumber', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.bankReference.confirmationNumber = '1234567890';
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });

    it('should accept zelleConfirmation', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.bankReference.zelleConfirmation = 'T0ZDL3WND';
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });

    it('should accept atmId', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.bankReference.atmId = '000009733';
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });

    it('should accept checkNumber', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.bankReference.checkNumber = '1234';
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });
  });

  describe('Merchant validation', () => {
    it('should accept null merchant name', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.merchant.name = null;
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });

    it('should accept full merchant info', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.merchant = {
        name: 'STARBUCKS',
        normalizedName: 'Starbucks',
        city: 'SEATTLE',
        state: 'WA',
        phone: '800-555-1234',
        online: false,
        network: 'VISA',
      };
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });

    it('should accept valid card networks', () => {
      const networks: Array<'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER' | null> = ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', null];
      for (const network of networks) {
        const output = createValidOutput();
        output.statements[0]!.transactions[0]!.merchant.network = network;
        const result = validateOutput(output);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('Flags validation', () => {
    it('should accept valid flags', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.flags = {
        isRecurring: true,
        isSubscription: true,
        isTransfer: false,
      };
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });

    it('should accept empty flags object', () => {
      const output = createValidOutput();
      output.statements[0]!.transactions[0]!.flags = {};
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });
  });

  describe('Section totals validation', () => {
    it('should accept valid section totals', () => {
      const output = createValidOutput();
      output.statements[0]!.sections = {
        deposits: { total: 500.00, count: 2 },
        atmAndDebitCard: { total: 200.00, count: 3 },
        checks: { total: 100.00, count: 1 },
      };
      const result = validateOutput(output);
      expect(result.valid).toBe(true);
    });
  });
});
