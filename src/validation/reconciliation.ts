/**
 * Balance reconciliation validation for parsed statements.
 * Verifies that: beginning_balance + credits - debits ≈ ending_balance
 */

export interface ReconciliationResult {
  /** Whether the reconciliation passed within tolerance */
  passed: boolean;
  /** Expected ending balance based on calculation */
  expectedEndingBalance: number;
  /** Actual ending balance from statement */
  actualEndingBalance: number;
  /** Difference between expected and actual */
  difference: number;
  /** Tolerance used for comparison */
  tolerance: number;
  /** Detailed breakdown */
  breakdown: {
    startingBalance: number;
    totalCredits: number;
    totalDebits: number;
    calculatedEnding: number;
  };
}

export interface ReconciliationOptions {
  /** Tolerance for balance comparison (default: 0.01) */
  tolerance?: number;
  /** Whether to treat missing balances as errors */
  strictBalances?: boolean;
}

/**
 * Validate balance reconciliation for a statement.
 * 
 * Formula: starting_balance + credits - debits = ending_balance
 * 
 * @param startingBalance - Beginning balance from statement
 * @param endingBalance - Ending balance from statement
 * @param totalCredits - Sum of all credits/deposits
 * @param totalDebits - Sum of all debits/withdrawals (as positive number)
 * @param options - Reconciliation options
 * @returns Reconciliation result
 */
export function validateReconciliation(
  startingBalance: number,
  endingBalance: number,
  totalCredits: number,
  totalDebits: number,
  options: ReconciliationOptions = {}
): ReconciliationResult {
  const { tolerance = 0.01 } = options;
  
  // Calculate expected ending balance
  // Note: totalDebits should be positive, we subtract it
  const calculatedEnding = startingBalance + totalCredits - totalDebits;
  
  // Calculate difference
  const difference = Math.abs(calculatedEnding - endingBalance);
  
  // Check if within tolerance
  const passed = difference <= tolerance;
  
  return {
    passed,
    expectedEndingBalance: calculatedEnding,
    actualEndingBalance: endingBalance,
    difference,
    tolerance,
    breakdown: {
      startingBalance,
      totalCredits,
      totalDebits,
      calculatedEnding,
    },
  };
}

/**
 * Validate reconciliation from parsed statement data.
 */
export function validateStatementReconciliation(
  summary: {
    startingBalance: number;
    endingBalance: number;
    totalCredits: number;
    totalDebits: number;
  },
  options: ReconciliationOptions = {}
): ReconciliationResult {
  return validateReconciliation(
    summary.startingBalance,
    summary.endingBalance,
    summary.totalCredits,
    summary.totalDebits,
    options
  );
}

/**
 * Calculate total credits from transactions.
 */
export function calculateTotalCredits(
  transactions: Array<{ amount: number | string }>
): number {
  let total = 0;
  for (const txn of transactions) {
    const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount.replace(/,/g, '')) : txn.amount;
    if (!isNaN(amount) && amount > 0) {
      total += amount;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Calculate total debits from transactions (returns positive number).
 */
export function calculateTotalDebits(
  transactions: Array<{ amount: number | string }>
): number {
  let total = 0;
  for (const txn of transactions) {
    const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount.replace(/,/g, '')) : txn.amount;
    if (!isNaN(amount) && amount < 0) {
      total += Math.abs(amount);
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Validate that transaction totals match statement summary.
 */
export function validateTransactionTotals(
  transactions: Array<{ amount: number | string }>,
  summary: {
    totalCredits: number;
    totalDebits: number;
  },
  tolerance: number = 0.01
): {
  creditsMatch: boolean;
  debitsMatch: boolean;
  calculatedCredits: number;
  calculatedDebits: number;
  creditsDifference: number;
  debitsDifference: number;
} {
  const calculatedCredits = calculateTotalCredits(transactions);
  const calculatedDebits = calculateTotalDebits(transactions);
  
  const creditsDifference = Math.abs(calculatedCredits - summary.totalCredits);
  const debitsDifference = Math.abs(calculatedDebits - summary.totalDebits);
  
  return {
    creditsMatch: creditsDifference <= tolerance,
    debitsMatch: debitsDifference <= tolerance,
    calculatedCredits,
    calculatedDebits,
    creditsDifference,
    debitsDifference,
  };
}

/**
 * Format reconciliation result as a human-readable message.
 */
export function formatReconciliationResult(result: ReconciliationResult): string {
  const { passed, breakdown, difference, tolerance } = result;
  
  const lines = [
    `Balance Reconciliation: ${passed ? 'PASSED' : 'FAILED'}`,
    `  Starting Balance: $${breakdown.startingBalance.toFixed(2)}`,
    `  + Total Credits:  $${breakdown.totalCredits.toFixed(2)}`,
    `  - Total Debits:   $${breakdown.totalDebits.toFixed(2)}`,
    `  = Expected:       $${breakdown.calculatedEnding.toFixed(2)}`,
    `  Actual Ending:    $${result.actualEndingBalance.toFixed(2)}`,
  ];
  
  if (!passed) {
    lines.push(`  Difference:       $${difference.toFixed(2)} (tolerance: $${tolerance.toFixed(2)})`);
  }
  
  return lines.join('\n');
}
