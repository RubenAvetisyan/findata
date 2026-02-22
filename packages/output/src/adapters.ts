/**
 * Output adapters for converting canonical internal representation to v1 and v2 schema formats.
 */

import type { ParsedStatement } from '@findata/types';
import type { SchemaVersion } from '@findata/types';
import { generateAnalytics, type AnalyticsResult } from './analytics.js';
import { checkIntegrity, type IntegrityCheckResult } from './integrity.js';
import {
  computeStatementId,
  computePeriodLabel,
  computeTransactionId,
} from '@findata/types';

/**
 * Canonical internal representation used by the parser.
 * This is the intermediate format that gets converted to v1 or v2 output.
 */
export interface CanonicalOutput {
  statements: ParsedStatement[];
  totalStatements: number;
  totalTransactions: number;
  parseErrors?: Array<{ filename: string; error: string }>;
}

/**
 * V1 output format - array of statements with metadata
 */
export interface FinalResultV1 {
  schemaVersion?: 'v1';
  statements: Array<{
    account: {
      institution: 'Bank of America';
      accountType: string;
      accountNumberMasked: string;
      statementPeriod: {
        start: string;
        end: string;
      };
      currency: 'USD';
    };
    summary: {
      startingBalance: number;
      endingBalance: number;
      totalCredits: number;
      totalDebits: number;
    };
    transactions: Array<{
      date: string;
      postedDate: string | null;
      description: string;
      merchant: string | null;
      amount: number;
      direction: 'debit' | 'credit';
      category: string;
      subcategory: string | null;
      confidence: number;
      raw: {
        originalText: string;
        page: number;
      };
    }>;
    metadata: {
      parserVersion: string;
      parsedAt: string;
      warnings: string[];
    };
  }>;
  totalStatements: number;
  totalTransactions: number;
  parseErrors?: Array<{ filename: string; error: string }>;
}

/**
 * V2 output format - BOFA rollup with accounts array, analytics, and integrity checks
 */
export interface FinalResultV2 {
  schemaVersion: 'v2';
  startingBalance: number;
  endingBalance: number;
  totalStatements: number;
  totalTransactions: number;
  analytics: AnalyticsResult;
  integrity: IntegrityCheckResult;
  accounts: Array<{
    account: {
      institution: string;
      accountType: string;
      accountNumberMasked: string;
      statementPeriod: {
        start: string;
        end: string;
      };
      currency: string;
    };
    summary: {
      startingBalance: number;
      endingBalance: number;
      totalCredits: number;
      totalDebits: number;
    };
    transactions: Array<{
      date: string;
      postedDate: string | null;
      description: string;
      merchant: string;
      amount: number;
      direction: 'debit' | 'credit';
      category: string;
      subcategory: string | null;
      confidence: number;
      statementId: string;
      periodLabel: string;
      transactionId: string;
      raw: {
        originalText: string;
        page: number;
      };
    }>;
    totalStatements: number;
    totalTransactions: number;
  }>;
}

/**
 * Convert canonical output to V1 format.
 * V1 is the current/legacy format with statements array.
 */
export function toFinalResultV1(canonical: CanonicalOutput, includeSchemaVersion = false): FinalResultV1 {
  const result: FinalResultV1 = {
    statements: canonical.statements.map((stmt) => ({
      account: {
        institution: stmt.account.institution,
        accountType: stmt.account.accountType,
        accountNumberMasked: stmt.account.accountNumberMasked,
        statementPeriod: {
          start: stmt.account.statementPeriod.start,
          end: stmt.account.statementPeriod.end,
        },
        currency: stmt.account.currency,
      },
      summary: {
        startingBalance: stmt.summary.startingBalance,
        endingBalance: stmt.summary.endingBalance,
        totalCredits: stmt.summary.totalCredits,
        totalDebits: stmt.summary.totalDebits,
      },
      transactions: stmt.transactions.map((txn) => ({
        date: txn.date,
        postedDate: txn.postedDate,
        description: txn.description,
        merchant: txn.merchant,
        amount: txn.amount,
        direction: txn.direction,
        category: txn.category,
        subcategory: txn.subcategory,
        confidence: txn.confidence,
        raw: {
          originalText: txn.raw.originalText,
          page: txn.raw.page,
        },
      })),
      metadata: {
        parserVersion: stmt.metadata.parserVersion,
        parsedAt: stmt.metadata.parsedAt,
        warnings: stmt.metadata.warnings,
      },
    })),
    totalStatements: canonical.totalStatements,
    totalTransactions: canonical.totalTransactions,
  };

  if (includeSchemaVersion) {
    result.schemaVersion = 'v1';
  }

  if (canonical.parseErrors !== undefined && canonical.parseErrors.length > 0) {
    result.parseErrors = canonical.parseErrors;
  }

  return result;
}

/**
 * Group statements by account number for V2 rollup
 */
interface AccountGroup {
  accountKey: string;
  statements: ParsedStatement[];
}

function groupStatementsByAccount(statements: ParsedStatement[]): AccountGroup[] {
  const groups = new Map<string, ParsedStatement[]>();

  for (const stmt of statements) {
    const key = `${stmt.account.accountType}-${stmt.account.accountNumberMasked}`;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.push(stmt);
    } else {
      groups.set(key, [stmt]);
    }
  }

  return Array.from(groups.entries()).map(([accountKey, stmts]) => ({
    accountKey,
    statements: stmts,
  }));
}

/**
 * Convert canonical output to V2 format (BOFA rollup).
 * V2 groups transactions by account and provides rollup totals.
 */
export function toFinalResultV2(canonical: CanonicalOutput): FinalResultV2 {
  const accountGroups = groupStatementsByAccount(canonical.statements);

  // Calculate rollup totals across all accounts
  let totalStartingBalance = 0;
  let totalEndingBalance = 0;

  const accounts = accountGroups.map((group) => {
    // Sort statements by date to get first and last
    const sortedStatements = [...group.statements].sort((a, b) =>
      a.account.statementPeriod.start.localeCompare(b.account.statementPeriod.start)
    );

    const firstStatement = sortedStatements[0];
    const lastStatement = sortedStatements[sortedStatements.length - 1];

    if (firstStatement === undefined || lastStatement === undefined) {
      throw new Error('Account group has no statements');
    }

    // Calculate account-level summary
    const accountStartingBalance = firstStatement.summary.startingBalance;
    const accountEndingBalance = lastStatement.summary.endingBalance;

    let accountTotalCredits = 0;
    let accountTotalDebits = 0;

    for (const stmt of group.statements) {
      accountTotalCredits += stmt.summary.totalCredits;
      accountTotalDebits += stmt.summary.totalDebits;
    }

    totalStartingBalance += accountStartingBalance;
    totalEndingBalance += accountEndingBalance;

    // Collect all transactions for this account with traceability and transaction IDs
    const allTransactions = group.statements.flatMap((stmt) => {
      const statementId = computeStatementId(stmt);
      const periodLabel = computePeriodLabel(stmt);
      return stmt.transactions.map((txn) => {
        const transactionId = computeTransactionId(txn, statementId);
        return {
          date: txn.date,
          postedDate: txn.postedDate,
          description: txn.description,
          merchant: txn.merchant ?? 'Unknown',
          amount: txn.amount,
          direction: txn.direction,
          category: txn.category,
          subcategory: txn.subcategory,
          confidence: txn.confidence,
          statementId,
          periodLabel,
          transactionId,
          raw: {
            originalText: txn.raw.originalText,
            page: txn.raw.page,
          },
        };
      });
    });

    // Sort transactions by date
    allTransactions.sort((a, b) => a.date.localeCompare(b.date));

    // Determine overall statement period for this account
    const periodStart = firstStatement.account.statementPeriod.start;
    const periodEnd = lastStatement.account.statementPeriod.end;

    return {
      account: {
        institution: firstStatement.account.institution,
        accountType: firstStatement.account.accountType,
        accountNumberMasked: firstStatement.account.accountNumberMasked,
        statementPeriod: {
          start: periodStart,
          end: periodEnd,
        },
        currency: firstStatement.account.currency,
      },
      summary: {
        startingBalance: accountStartingBalance,
        endingBalance: accountEndingBalance,
        totalCredits: accountTotalCredits,
        totalDebits: accountTotalDebits,
      },
      transactions: allTransactions,
      totalStatements: group.statements.length,
      totalTransactions: allTransactions.length,
    };
  });

  // Generate analytics from all statements
  const analytics = generateAnalytics(canonical.statements);

  // Run integrity checks on all statements
  const integrity = checkIntegrity(canonical.statements);

  return {
    schemaVersion: 'v2',
    startingBalance: totalStartingBalance,
    endingBalance: totalEndingBalance,
    totalStatements: canonical.totalStatements,
    totalTransactions: canonical.totalTransactions,
    analytics,
    integrity,
    accounts,
  };
}

/**
 * Convert canonical output to the specified schema version format.
 */
export function toFinalResult(
  canonical: CanonicalOutput,
  version: SchemaVersion
): FinalResultV1 | FinalResultV2 {
  switch (version) {
    case 'v1':
      return toFinalResultV1(canonical, true);
    case 'v2':
      return toFinalResultV2(canonical);
    default: {
      const _exhaustive: never = version;
      throw new Error(`Unknown schema version: ${String(_exhaustive)}`);
    }
  }
}
