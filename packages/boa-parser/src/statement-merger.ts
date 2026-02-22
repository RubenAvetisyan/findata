import type { ParsedStatement, ZodTransaction as Transaction } from '@findata/types';

export interface MergeResult {
  statements: ParsedStatement[];
  totalTransactions: number;
  duplicateStatementsRemoved: number;
  duplicateTransactionsRemoved: number;
}

/**
 * Statement with source file metadata for deduplication decisions.
 */
export interface StatementWithSource {
  statement: ParsedStatement;
  sourceFile: string;
  isCombinedPdf: boolean;
}

/**
 * Generates a unique key for a statement based on account and period.
 * 
 * Identity Key Hierarchy:
 * 1. Primary (best): accountNumberMasked + statementPeriod.start + statementPeriod.end
 * 
 * Format: "{accountType}|{accountNumberMasked}|{periodStart}|{periodEnd}"
 */
export function getStatementKey(statement: ParsedStatement): string {
  const accountType = statement.account.accountType;
  const acct = statement.account.accountNumberMasked;
  const periodStart = statement.account.statementPeriod.start;
  const periodEnd = statement.account.statementPeriod.end;
  
  // Primary key: account + period dates (most reliable)
  if (periodStart && periodEnd && periodStart !== '' && periodEnd !== '') {
    return `${accountType}|${acct}|${periodStart}|${periodEnd}`;
  }
  
  // Secondary fallback: account + ending balance + starting balance
  // This is less reliable but works when dates are missing
  const startBal = statement.summary.startingBalance.toFixed(2);
  const endBal = statement.summary.endingBalance.toFixed(2);
  return `${acct}|bal:${startBal}|${endBal}`;
}

/**
 * Generates a unique key for a transaction for deduplication.
 * 
 * Key components:
 * - date: Transaction date (YYYY-MM-DD)
 * - amount: Exact amount with sign
 * - description: Normalized (trimmed, lowercased, whitespace collapsed)
 * - direction: debit/credit to handle edge cases
 * 
 * Format: "{date}|{amount}|{direction}|{description_normalized}"
 */
export function getTransactionKey(transaction: Transaction): string {
  // Normalize description: trim, lowercase, collapse whitespace
  const normalizedDesc = transaction.description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  
  return `${transaction.date}|${transaction.amount}|${transaction.direction}|${normalizedDesc}`;
}

/**
 * Calculates a completeness score for a statement.
 * Higher score = more complete/reliable data.
 * 
 * Scoring factors:
 * - Transaction count (primary indicator)
 * - Non-zero totals
 * - Non-empty warnings (fewer = better)
 * - Valid balances
 */
export function calculateCompletenessScore(statement: ParsedStatement): number {
  let score = 0;
  
  // Transaction count is the primary indicator (weighted heavily)
  score += statement.transactions.length * 10;
  
  // Non-zero totals indicate complete extraction
  if (statement.summary.totalCredits > 0) score += 5;
  if (statement.summary.totalDebits > 0) score += 5;
  
  // Valid balances
  if (statement.summary.startingBalance !== 0 || statement.summary.endingBalance !== 0) {
    score += 3;
  }
  
  // Fewer warnings = better quality
  score -= statement.metadata.warnings.length * 2;
  
  // Valid period dates
  if (statement.account.statementPeriod.start && statement.account.statementPeriod.end) {
    score += 5;
  }
  
  // Valid account number (not default)
  if (statement.account.accountNumberMasked !== '****0000') {
    score += 3;
  }
  
  return score;
}

/**
 * Determines which statement to keep when duplicates are found.
 * 
 * Tie-break rules (in order):
 * 1. Higher completeness score wins
 * 2. If tied, prefer standalone PDF over combined PDF (less merge artifacts)
 * 3. If still tied, prefer lexicographically smaller source filename (deterministic)
 * 
 * @returns The statement that should be kept
 */
export function resolveStatementDuplicate(
  existing: StatementWithSource,
  candidate: StatementWithSource
): StatementWithSource {
  const existingScore = calculateCompletenessScore(existing.statement);
  const candidateScore = calculateCompletenessScore(candidate.statement);
  
  // Rule 1: Higher completeness score wins
  if (candidateScore > existingScore) {
    return candidate;
  }
  if (existingScore > candidateScore) {
    return existing;
  }
  
  // Rule 2: Prefer standalone PDF over combined PDF (if scores are equal)
  // Standalone PDFs are less likely to have merge artifacts
  if (!candidate.isCombinedPdf && existing.isCombinedPdf) {
    return candidate;
  }
  if (!existing.isCombinedPdf && candidate.isCombinedPdf) {
    return existing;
  }
  
  // Rule 3: Lexicographically smaller filename (deterministic tie-break)
  if (candidate.sourceFile.localeCompare(existing.sourceFile) < 0) {
    return candidate;
  }
  
  return existing;
}

/**
 * Detects if a filename suggests a combined/merged PDF.
 */
export function isCombinedPdfFilename(filename: string): boolean {
  const lowerName = filename.toLowerCase();
  return (
    lowerName.includes('combined') ||
    lowerName.includes('merged') ||
    lowerName.includes('all_statements') ||
    lowerName.includes('all-statements') ||
    lowerName.includes('allstatements')
  );
}

/**
 * Merges multiple arrays of statements with source tracking, removing duplicates.
 * 
 * Deduplication rules:
 * 1. Statements are identified by: accountNumberMasked + statementPeriod.start + statementPeriod.end
 * 2. If duplicate statements exist, use completeness scoring and tie-break rules
 * 3. Within each statement, transactions are deduped by: date + amount + direction + normalized description
 * 
 * Ordering:
 * - Statements are sorted by statementPeriod.start ascending
 * - Transactions within each statement are sorted by date ascending
 */
export function mergeStatements(statementArrays: ParsedStatement[][]): MergeResult {
  // For backward compatibility, call mergeStatementsWithSources with empty source info
  const statementsWithSources: StatementWithSource[][] = statementArrays.map(statements =>
    statements.map(statement => ({
      statement,
      sourceFile: 'unknown',
      isCombinedPdf: false,
    }))
  );
  
  return mergeStatementsWithSources(statementsWithSources);
}

/**
 * Merges statements with full source tracking for robust deduplication.
 */
export function mergeStatementsWithSources(
  statementArrays: StatementWithSource[][]
): MergeResult {
  const statementMap = new Map<string, StatementWithSource>();
  let duplicateStatementsRemoved = 0;
  
  // Flatten and dedupe statements
  for (const statements of statementArrays) {
    for (const stmtWithSource of statements) {
      const key = getStatementKey(stmtWithSource.statement);
      const existing = statementMap.get(key);
      
      if (existing !== undefined) {
        // Use robust duplicate resolution
        const winner = resolveStatementDuplicate(existing, stmtWithSource);
        statementMap.set(key, winner);
        duplicateStatementsRemoved++;
      } else {
        statementMap.set(key, stmtWithSource);
      }
    }
  }
  
  // Convert to array and sort by period start date
  const mergedStatements = Array.from(statementMap.values())
    .map(s => s.statement)
    .sort((a, b) => a.account.statementPeriod.start.localeCompare(b.account.statementPeriod.start));
  
  // Dedupe transactions within each statement and sort
  let totalTransactions = 0;
  let duplicateTransactionsRemoved = 0;
  
  for (const statement of mergedStatements) {
    const { transactions, duplicatesRemoved } = dedupeTransactions(statement.transactions);
    statement.transactions = transactions;
    totalTransactions += transactions.length;
    duplicateTransactionsRemoved += duplicatesRemoved;
  }
  
  return {
    statements: mergedStatements,
    totalTransactions,
    duplicateStatementsRemoved,
    duplicateTransactionsRemoved,
  };
}

/**
 * Deduplicates transactions within a single statement.
 * Returns sorted transactions by date ascending.
 */
function dedupeTransactions(transactions: Transaction[]): {
  transactions: Transaction[];
  duplicatesRemoved: number;
} {
  const seen = new Map<string, Transaction>();
  let duplicatesRemoved = 0;
  
  for (const txn of transactions) {
    const key = getTransactionKey(txn);
    const existing = seen.get(key);
    
    if (existing !== undefined) {
      // Keep the one with higher confidence
      if (txn.confidence > existing.confidence) {
        seen.set(key, txn);
      }
      duplicatesRemoved++;
    } else {
      seen.set(key, txn);
    }
  }
  
  // Sort by date ascending
  const dedupedTransactions = Array.from(seen.values())
    .sort((a, b) => a.date.localeCompare(b.date));
  
  return {
    transactions: dedupedTransactions,
    duplicatesRemoved,
  };
}

/**
 * Recalculates statement summary totals based on actual transactions.
 * This ensures consistency after merging/deduping.
 */
export function recalculateSummary(statement: ParsedStatement): void {
  let totalCredits = 0;
  let totalDebits = 0;
  
  for (const txn of statement.transactions) {
    if (txn.direction === 'credit') {
      totalCredits += txn.amount;
    } else {
      totalDebits += Math.abs(txn.amount);
    }
  }
  
  statement.summary.totalCredits = Math.round(totalCredits * 100) / 100;
  statement.summary.totalDebits = Math.round(totalDebits * 100) / 100;
}
