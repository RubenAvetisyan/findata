import { describe, it, expect } from 'vitest';
import {
  sortTransactionsByDate,
  deduplicateTransactions,
  filterTransactionsByDateRange,
  groupTransactionsByCategory,
  calculateCategoryTotals,
} from '../../src/normalizers/index.js';
import type { Transaction } from '../../src/schemas/index.js';

const createTransaction = (overrides: Partial<Transaction>): Transaction => ({
  date: '2024-01-15',
  postedDate: null,
  description: 'Test transaction',
  merchant: 'Test Merchant',
  amount: -100,
  direction: 'debit',
  category: 'Uncategorized',
  subcategory: null,
  confidence: 0.5,
  raw: { originalText: 'test', page: 1 },
  ...overrides,
});

describe('sortTransactionsByDate', () => {
  it('should sort transactions by date ascending', () => {
    const transactions = [
      createTransaction({ date: '2024-01-20' }),
      createTransaction({ date: '2024-01-10' }),
      createTransaction({ date: '2024-01-15' }),
    ];

    const sorted = sortTransactionsByDate(transactions);
    expect(sorted[0]?.date).toBe('2024-01-10');
    expect(sorted[1]?.date).toBe('2024-01-15');
    expect(sorted[2]?.date).toBe('2024-01-20');
  });

  it('should not mutate original array', () => {
    const transactions = [
      createTransaction({ date: '2024-01-20' }),
      createTransaction({ date: '2024-01-10' }),
    ];

    sortTransactionsByDate(transactions);
    expect(transactions[0]?.date).toBe('2024-01-20');
  });
});

describe('deduplicateTransactions', () => {
  it('should remove duplicate transactions', () => {
    const transactions = [
      createTransaction({ date: '2024-01-15', description: 'Test', amount: -100 }),
      createTransaction({ date: '2024-01-15', description: 'Test', amount: -100 }),
      createTransaction({ date: '2024-01-15', description: 'Different', amount: -100 }),
    ];

    const deduped = deduplicateTransactions(transactions);
    expect(deduped).toHaveLength(2);
  });

  it('should keep transactions with different amounts', () => {
    const transactions = [
      createTransaction({ date: '2024-01-15', description: 'Test', amount: -100 }),
      createTransaction({ date: '2024-01-15', description: 'Test', amount: -200 }),
    ];

    const deduped = deduplicateTransactions(transactions);
    expect(deduped).toHaveLength(2);
  });
});

describe('filterTransactionsByDateRange', () => {
  it('should filter transactions within date range', () => {
    const transactions = [
      createTransaction({ date: '2024-01-05' }),
      createTransaction({ date: '2024-01-15' }),
      createTransaction({ date: '2024-01-25' }),
    ];

    const filtered = filterTransactionsByDateRange(transactions, '2024-01-10', '2024-01-20');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.date).toBe('2024-01-15');
  });

  it('should include boundary dates', () => {
    const transactions = [
      createTransaction({ date: '2024-01-10' }),
      createTransaction({ date: '2024-01-20' }),
    ];

    const filtered = filterTransactionsByDateRange(transactions, '2024-01-10', '2024-01-20');
    expect(filtered).toHaveLength(2);
  });
});

describe('groupTransactionsByCategory', () => {
  it('should group transactions by category', () => {
    const transactions = [
      createTransaction({ category: 'Food & Dining' }),
      createTransaction({ category: 'Food & Dining' }),
      createTransaction({ category: 'Shopping' }),
    ];

    const groups = groupTransactionsByCategory(transactions);
    expect(groups['Food & Dining']).toHaveLength(2);
    expect(groups['Shopping']).toHaveLength(1);
  });
});

describe('calculateCategoryTotals', () => {
  it('should calculate totals by category', () => {
    const transactions = [
      createTransaction({ category: 'Food & Dining', amount: -50 }),
      createTransaction({ category: 'Food & Dining', amount: -30 }),
      createTransaction({ category: 'Shopping', amount: -100 }),
    ];

    const totals = calculateCategoryTotals(transactions);
    expect(totals['Food & Dining']?.total).toBe(-80);
    expect(totals['Food & Dining']?.count).toBe(2);
    expect(totals['Shopping']?.total).toBe(-100);
    expect(totals['Shopping']?.count).toBe(1);
  });
});
