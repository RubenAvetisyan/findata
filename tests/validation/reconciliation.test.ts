/**
 * Tests for balance reconciliation validation.
 */
import { describe, it, expect } from 'vitest';
import {
  validateReconciliation,
  validateStatementReconciliation,
  calculateTotalCredits,
  calculateTotalDebits,
  validateTransactionTotals,
  formatReconciliationResult,
} from '@findata/types';

describe('validateReconciliation', () => {
  it('should pass when balances reconcile exactly', () => {
    const result = validateReconciliation(1000, 1200, 500, 300);
    
    expect(result.passed).toBe(true);
    expect(result.expectedEndingBalance).toBe(1200);
    expect(result.difference).toBe(0);
  });
  
  it('should pass when within tolerance', () => {
    const result = validateReconciliation(1000, 1200.005, 500, 300, { tolerance: 0.01 });
    
    expect(result.passed).toBe(true);
    expect(result.difference).toBeLessThanOrEqual(0.01);
  });
  
  it('should fail when outside tolerance', () => {
    const result = validateReconciliation(1000, 1250, 500, 300, { tolerance: 0.01 });
    
    expect(result.passed).toBe(false);
    expect(result.difference).toBe(50);
  });
  
  it('should handle zero balances', () => {
    const result = validateReconciliation(0, 200, 200, 0);
    
    expect(result.passed).toBe(true);
    expect(result.expectedEndingBalance).toBe(200);
  });
  
  it('should handle negative ending balance', () => {
    const result = validateReconciliation(100, -50, 50, 200);
    
    expect(result.passed).toBe(true);
    expect(result.expectedEndingBalance).toBe(-50);
  });
  
  it('should include breakdown in result', () => {
    const result = validateReconciliation(1000, 1200, 500, 300);
    
    expect(result.breakdown.startingBalance).toBe(1000);
    expect(result.breakdown.totalCredits).toBe(500);
    expect(result.breakdown.totalDebits).toBe(300);
    expect(result.breakdown.calculatedEnding).toBe(1200);
  });
});

describe('validateStatementReconciliation', () => {
  it('should validate from summary object', () => {
    const summary = {
      startingBalance: 1000,
      endingBalance: 1200,
      totalCredits: 500,
      totalDebits: 300,
    };
    
    const result = validateStatementReconciliation(summary);
    
    expect(result.passed).toBe(true);
  });
});

describe('calculateTotalCredits', () => {
  it('should sum positive amounts', () => {
    const transactions = [
      { amount: 100 },
      { amount: -50 },
      { amount: 200 },
      { amount: -25 },
    ];
    
    const total = calculateTotalCredits(transactions);
    
    expect(total).toBe(300);
  });
  
  it('should handle string amounts', () => {
    const transactions = [
      { amount: '100.00' },
      { amount: '-50.00' },
      { amount: '1,200.50' },
    ];
    
    const total = calculateTotalCredits(transactions);
    
    expect(total).toBe(1300.50);
  });
  
  it('should return 0 for empty array', () => {
    const total = calculateTotalCredits([]);
    expect(total).toBe(0);
  });
});

describe('calculateTotalDebits', () => {
  it('should sum absolute value of negative amounts', () => {
    const transactions = [
      { amount: 100 },
      { amount: -50 },
      { amount: 200 },
      { amount: -25 },
    ];
    
    const total = calculateTotalDebits(transactions);
    
    expect(total).toBe(75);
  });
  
  it('should handle string amounts', () => {
    const transactions = [
      { amount: '-100.00' },
      { amount: '50.00' },
      { amount: '-1,200.50' },
    ];
    
    const total = calculateTotalDebits(transactions);
    
    expect(total).toBe(1300.50);
  });
});

describe('validateTransactionTotals', () => {
  it('should validate when totals match', () => {
    const transactions = [
      { amount: 500 },
      { amount: -300 },
    ];
    
    const summary = {
      totalCredits: 500,
      totalDebits: 300,
    };
    
    const result = validateTransactionTotals(transactions, summary);
    
    expect(result.creditsMatch).toBe(true);
    expect(result.debitsMatch).toBe(true);
  });
  
  it('should detect mismatches', () => {
    const transactions = [
      { amount: 500 },
      { amount: -300 },
    ];
    
    const summary = {
      totalCredits: 600,
      totalDebits: 400,
    };
    
    const result = validateTransactionTotals(transactions, summary);
    
    expect(result.creditsMatch).toBe(false);
    expect(result.debitsMatch).toBe(false);
    expect(result.creditsDifference).toBe(100);
    expect(result.debitsDifference).toBe(100);
  });
});

describe('formatReconciliationResult', () => {
  it('should format passing result', () => {
    const result = validateReconciliation(1000, 1200, 500, 300);
    const formatted = formatReconciliationResult(result);
    
    expect(formatted).toContain('PASSED');
    expect(formatted).toContain('1000.00');
    expect(formatted).toContain('500.00');
    expect(formatted).toContain('300.00');
  });
  
  it('should format failing result with difference', () => {
    const result = validateReconciliation(1000, 1250, 500, 300);
    const formatted = formatReconciliationResult(result);
    
    expect(formatted).toContain('FAILED');
    expect(formatted).toContain('Difference');
  });
});
