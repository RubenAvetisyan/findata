import type { ZodTransaction as Transaction } from '@findata/types';
import { compareDates } from '@findata/types';

export function sortTransactionsByDate(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => compareDates(a.date, b.date));
}

export function deduplicateTransactions(transactions: Transaction[]): Transaction[] {
  const seen = new Set<string>();
  const result: Transaction[] = [];

  for (const txn of transactions) {
    const key = `${txn.date}|${txn.description}|${txn.amount}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(txn);
    }
  }

  return result;
}

export function filterTransactionsByDateRange(
  transactions: Transaction[],
  startDate: string,
  endDate: string
): Transaction[] {
  return transactions.filter((txn) => txn.date >= startDate && txn.date <= endDate);
}

export function groupTransactionsByCategory(
  transactions: Transaction[]
): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};

  for (const txn of transactions) {
    const existing = groups[txn.category];
    if (existing !== undefined) {
      existing.push(txn);
    } else {
      groups[txn.category] = [txn];
    }
  }

  return groups;
}

export function calculateCategoryTotals(
  transactions: Transaction[]
): Record<string, { total: number; count: number }> {
  const totals: Record<string, { total: number; count: number }> = {};

  for (const txn of transactions) {
    const existing = totals[txn.category];
    if (existing !== undefined) {
      existing.total += txn.amount;
      existing.count += 1;
    } else {
      totals[txn.category] = { total: txn.amount, count: 1 };
    }
  }

  return totals;
}
