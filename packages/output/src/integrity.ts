/**
 * Accounting Integrity Check Module
 * 
 * Implements deterministic validation per statement period:
 * BeginningBalance + TotalDeposits - (ATM/Debit + Other + Checks + Fees) = EndingBalance
 * 
 * Discrepancies are flagged explicitly, never silently fixed.
 */

import type { ParsedStatement } from '@findata/types';
import { computeStatementId, computePeriodLabel } from '@findata/types';

/**
 * Balance discrepancy diagnostic
 */
export interface BalanceDiscrepancy {
  statementId: string;
  periodLabel: string;
  expectedEndingBalance: number;
  actualEndingBalance: number;
  delta: number;
  equation: {
    beginningBalance: number;
    totalCredits: number;
    totalDebits: number;
    calculatedEnding: number;
  };
  severity: 'info' | 'warning' | 'error';
  message: string;
}

/**
 * Statement integrity check result
 */
export interface StatementIntegrityResult {
  statementId: string;
  periodLabel: string;
  isValid: boolean;
  balanceCheck: {
    passed: boolean;
    beginningBalance: number;
    endingBalance: number;
    totalCredits: number;
    totalDebits: number;
    calculatedEnding: number;
    delta: number;
  };
  transactionCheck: {
    passed: boolean;
    expectedCount: number;
    actualCount: number;
  };
  discrepancies: BalanceDiscrepancy[];
}

/**
 * Overall integrity check result
 */
export interface IntegrityCheckResult {
  overallValid: boolean;
  statementsChecked: number;
  statementsWithIssues: number;
  statementResults: StatementIntegrityResult[];
  summary: {
    totalDiscrepancies: number;
    totalDelta: number;
    warnings: string[];
    epsilon?: number;
  };
}

/** Default epsilon for balance reconciliation */
export const DEFAULT_EPSILON = 0.01;

/**
 * Check accounting integrity for a single statement
 * @param statement - The parsed statement to check
 * @param epsilon - Tolerance for balance comparison (default: 0.01)
 */
export function checkStatementIntegrity(
  statement: ParsedStatement,
  epsilon: number = DEFAULT_EPSILON
): StatementIntegrityResult {
  const statementId = computeStatementId(statement);
  const periodLabel = computePeriodLabel(statement);
  
  const beginningBalance = statement.summary.startingBalance;
  const endingBalance = statement.summary.endingBalance;
  const totalCredits = statement.summary.totalCredits;
  const totalDebits = statement.summary.totalDebits;
  
  // Calculate expected ending balance
  // EndingBalance = BeginningBalance + Credits - Debits
  const calculatedEnding = beginningBalance + totalCredits - totalDebits;
  const delta = Math.round((endingBalance - calculatedEnding) * 100) / 100;
  
  const balancePassed = Math.abs(delta) <= epsilon;
  
  // Check transaction count
  const actualCount = statement.transactions.length;
  const expectedCount = actualCount; // We don't have a separate expected count
  const transactionPassed = true; // Always passes unless we have external validation
  
  const discrepancies: BalanceDiscrepancy[] = [];
  
  if (!balancePassed) {
    // Severity: error if > $1.00, warning if > epsilon but <= $1.00
    const severity = Math.abs(delta) > 1.00 ? 'error' : 'warning';
    discrepancies.push({
      statementId,
      periodLabel,
      expectedEndingBalance: calculatedEnding,
      actualEndingBalance: endingBalance,
      delta,
      equation: {
        beginningBalance,
        totalCredits,
        totalDebits,
        calculatedEnding,
      },
      severity,
      message: `Balance mismatch: ${beginningBalance} + ${totalCredits} - ${totalDebits} = ${calculatedEnding}, but statement shows ${endingBalance} (delta: ${delta})`,
    });
  }
  
  return {
    statementId,
    periodLabel,
    isValid: balancePassed && transactionPassed,
    balanceCheck: {
      passed: balancePassed,
      beginningBalance,
      endingBalance,
      totalCredits,
      totalDebits,
      calculatedEnding,
      delta,
    },
    transactionCheck: {
      passed: transactionPassed,
      expectedCount,
      actualCount,
    },
    discrepancies,
  };
}

/**
 * Check accounting integrity for all statements
 * @param statements - Array of parsed statements to check
 * @param epsilon - Tolerance for balance comparison (default: 0.01)
 */
export function checkIntegrity(
  statements: ParsedStatement[],
  epsilon: number = DEFAULT_EPSILON
): IntegrityCheckResult {
  const statementResults = statements.map((stmt) => checkStatementIntegrity(stmt, epsilon));
  
  const statementsWithIssues = statementResults.filter(r => !r.isValid).length;
  const allDiscrepancies = statementResults.flatMap(r => r.discrepancies);
  const totalDelta = allDiscrepancies.reduce((sum, d) => sum + d.delta, 0);
  
  const warnings: string[] = [];
  if (statementsWithIssues > 0) {
    warnings.push(`${statementsWithIssues} statement(s) have balance discrepancies`);
  }
  if (Math.abs(totalDelta) > 1) {
    warnings.push(`Total cumulative delta: $${totalDelta.toFixed(2)}`);
  }
  
  return {
    overallValid: statementsWithIssues === 0,
    statementsChecked: statements.length,
    statementsWithIssues,
    statementResults,
    summary: {
      totalDiscrepancies: allDiscrepancies.length,
      totalDelta: Math.round(totalDelta * 100) / 100,
      warnings,
      epsilon,
    },
  };
}

/**
 * Add traceability fields to transactions
 * @deprecated Use computeStatementId and computePeriodLabel from utils/id-generator.js instead
 */
export function addTraceability(
  statement: ParsedStatement
): { statementId: string; periodLabel: string } {
  const statementId = computeStatementId(statement);
  const periodLabel = computePeriodLabel(statement);
  return { statementId, periodLabel };
}
