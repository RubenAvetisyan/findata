/**
 * Accounting Integrity Check Module
 * 
 * Implements deterministic validation per statement period:
 * BeginningBalance + TotalDeposits - (ATM/Debit + Other + Checks + Fees) = EndingBalance
 * 
 * Discrepancies are flagged explicitly, never silently fixed.
 */

import type { ParsedStatement } from '../schemas/index.js';

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
  };
}

/**
 * Generate a unique statement ID
 */
export function generateStatementId(
  accountType: string,
  accountNumberMasked: string,
  periodStart: string,
  periodEnd: string
): string {
  const acctSuffix = accountNumberMasked.replace(/\*/g, '');
  const startShort = periodStart.replace(/-/g, '');
  const endShort = periodEnd.replace(/-/g, '');
  return `${accountType.toUpperCase()}-${acctSuffix}-${startShort}-${endShort}`;
}

/**
 * Generate a human-readable period label
 */
export function generatePeriodLabel(
  accountType: string,
  periodStart: string,
  periodEnd: string
): string {
  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);
  const startMonth = startDate.toLocaleString('en-US', { month: 'short' });
  const endMonth = endDate.toLocaleString('en-US', { month: 'short' });
  const year = endDate.getFullYear();
  
  if (startMonth === endMonth) {
    return `${year}-${String(endDate.getMonth() + 1).padStart(2, '0')} BOA ${capitalize(accountType)}`;
  }
  return `${startMonth}-${endMonth} ${year} BOA ${capitalize(accountType)}`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Check accounting integrity for a single statement
 */
export function checkStatementIntegrity(statement: ParsedStatement): StatementIntegrityResult {
  const statementId = generateStatementId(
    statement.account.accountType,
    statement.account.accountNumberMasked,
    statement.account.statementPeriod.start,
    statement.account.statementPeriod.end
  );
  
  const periodLabel = generatePeriodLabel(
    statement.account.accountType,
    statement.account.statementPeriod.start,
    statement.account.statementPeriod.end
  );
  
  const beginningBalance = statement.summary.startingBalance;
  const endingBalance = statement.summary.endingBalance;
  const totalCredits = statement.summary.totalCredits;
  const totalDebits = statement.summary.totalDebits;
  
  // Calculate expected ending balance
  // EndingBalance = BeginningBalance + Credits - Debits
  const calculatedEnding = beginningBalance + totalCredits - totalDebits;
  const delta = Math.round((endingBalance - calculatedEnding) * 100) / 100;
  
  const balancePassed = Math.abs(delta) < 0.01; // Allow 1 cent tolerance for rounding
  
  // Check transaction count
  const actualCount = statement.transactions.length;
  const expectedCount = actualCount; // We don't have a separate expected count
  const transactionPassed = true; // Always passes unless we have external validation
  
  const discrepancies: BalanceDiscrepancy[] = [];
  
  if (!balancePassed) {
    const severity = Math.abs(delta) > 100 ? 'error' : Math.abs(delta) > 1 ? 'warning' : 'info';
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
 */
export function checkIntegrity(statements: ParsedStatement[]): IntegrityCheckResult {
  const statementResults = statements.map(checkStatementIntegrity);
  
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
    },
  };
}

/**
 * Add traceability fields to transactions
 */
export function addTraceability(
  statement: ParsedStatement
): { statementId: string; periodLabel: string } {
  const statementId = generateStatementId(
    statement.account.accountType,
    statement.account.accountNumberMasked,
    statement.account.statementPeriod.start,
    statement.account.statementPeriod.end
  );
  
  const periodLabel = generatePeriodLabel(
    statement.account.accountType,
    statement.account.statementPeriod.start,
    statement.account.statementPeriod.end
  );
  
  return { statementId, periodLabel };
}
