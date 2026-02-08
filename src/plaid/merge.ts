/**
 * Merge Plaid enriched transaction data into a parsed result JSON.
 *
 * Operations:
 * - UPDATE: Matched PDF transactions get enriched with Plaid data
 *   (merchant name, location, Plaid category, postedDate, plaidTransactionId)
 * - ADD: Unmatched Plaid transactions are added as new entries
 * - CREATE: New accounts from Plaid are added if not present in result
 */

import type { PlaidTransaction, PlaidAccount } from './types.js';
import type { ReconciliationResult } from './reconcile.js';
import { mapAccountType } from './normalizer.js';

/** Shape of a transaction in result.json (v2 format) */
export interface ResultTransaction {
  date: string;
  postedDate: string | null;
  description: string;
  merchant: string | null;
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
  // Plaid enrichment fields (added by merge)
  plaid?: PlaidEnrichment;
}

export interface PlaidEnrichment {
  transactionId: string;
  merchantName: string | null;
  location: {
    address?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    lat?: number | null;
    lon?: number | null;
    storeNumber?: string | null;
  } | null;
  personalFinanceCategory: {
    primary: string;
    detailed: string;
    confidenceLevel?: string;
  } | null;
  paymentChannel: string;
  merchantEntityId?: string | null;
  logoUrl?: string | null;
}

export interface ResultAccount {
  account: {
    institution: string;
    accountType: string;
    accountNumberMasked: string;
    statementPeriod: { start: string; end: string };
    currency: string;
  };
  summary: {
    startingBalance: number;
    endingBalance: number;
    totalCredits: number;
    totalDebits: number;
  };
  transactions: ResultTransaction[];
}

export interface ResultJson {
  schemaVersion: string;
  startingBalance: number;
  endingBalance: number;
  totalStatements: number;
  totalTransactions: number;
  analytics?: unknown;
  integrity?: unknown;
  accounts: ResultAccount[];
  [key: string]: unknown;
}

export interface MergeResult {
  result: ResultJson;
  stats: MergeStats;
}

export interface MergeStats {
  totalPdfTransactions: number;
  totalPlaidTransactions: number;
  updated: number;
  added: number;
  accountsCreated: number;
  unmatchedPdf: number;
  unmatchedPlaid: number;
  matchRate: number;
}

/**
 * Build a PlaidEnrichment object from a Plaid transaction.
 */
function buildEnrichment(plaidTx: PlaidTransaction): PlaidEnrichment {
  return {
    transactionId: plaidTx.transactionId,
    merchantName: plaidTx.merchantName ?? null,
    location: plaidTx.location !== undefined ? {
      address: plaidTx.location.address ?? null,
      city: plaidTx.location.city ?? null,
      region: plaidTx.location.region ?? null,
      postalCode: plaidTx.location.postalCode ?? null,
      lat: plaidTx.location.lat ?? null,
      lon: plaidTx.location.lon ?? null,
      storeNumber: plaidTx.location.storeNumber ?? null,
    } : null,
    personalFinanceCategory: plaidTx.personalFinanceCategory !== undefined ? {
      primary: plaidTx.personalFinanceCategory.primary,
      detailed: plaidTx.personalFinanceCategory.detailed,
      ...(plaidTx.personalFinanceCategory.confidenceLevel !== undefined
        ? { confidenceLevel: plaidTx.personalFinanceCategory.confidenceLevel }
        : {}),
    } : null,
    paymentChannel: plaidTx.paymentChannel,
    merchantEntityId: plaidTx.merchantEntityId ?? null,
  };
}

/**
 * Convert a Plaid transaction to a ResultTransaction for adding to result.json.
 */
function plaidToResultTransaction(
  plaidTx: PlaidTransaction,
  account: PlaidAccount | undefined,
  statementId: string,
  periodLabel: string
): ResultTransaction {
  const isDebit = plaidTx.amount > 0;
  const direction: 'debit' | 'credit' = isDebit ? 'debit' : 'credit';
  const amount = plaidTx.amount; // Keep Plaid sign convention (positive=debit, negative=credit)

  // Map Plaid category to our category system
  const categoryMapping = mapPlaidPrimaryCategory(
    plaidTx.personalFinanceCategory?.primary
  );

  return {
    date: plaidTx.date,
    postedDate: plaidTx.authorizedDate ?? plaidTx.date,
    description: plaidTx.name,
    merchant: plaidTx.merchantName ?? plaidTx.name,
    amount,
    direction,
    category: categoryMapping.category,
    subcategory: categoryMapping.subcategory,
    confidence: 0.9,
    statementId,
    periodLabel,
    transactionId: `plaid_${plaidTx.transactionId}`,
    raw: {
      originalText: plaidTx.name,
      page: 0,
    },
    plaid: buildEnrichment(plaidTx),
  };
}

/**
 * Map Plaid primary category to our category/subcategory.
 */
function mapPlaidPrimaryCategory(primary?: string): { category: string; subcategory: string | null } {
  if (primary === undefined) return { category: 'Uncategorized', subcategory: null };

  const mapping: Record<string, { category: string; subcategory: string | null }> = {
    'INCOME': { category: 'Income', subcategory: 'Salary' },
    'TRANSFER_IN': { category: 'Transfer', subcategory: 'Transfer In' },
    'TRANSFER_OUT': { category: 'Transfer', subcategory: 'Transfer Out' },
    'LOAN_PAYMENTS': { category: 'Financial', subcategory: 'Loan Payment' },
    'BANK_FEES': { category: 'Fees', subcategory: 'Bank Fee' },
    'ENTERTAINMENT': { category: 'Entertainment', subcategory: null },
    'FOOD_AND_DRINK': { category: 'Food & Dining', subcategory: null },
    'GENERAL_MERCHANDISE': { category: 'Shopping', subcategory: 'General Merchandise' },
    'HOME_IMPROVEMENT': { category: 'Shopping', subcategory: 'Home Improvement' },
    'MEDICAL': { category: 'Health', subcategory: 'Medical' },
    'PERSONAL_CARE': { category: 'Personal Care', subcategory: null },
    'GENERAL_SERVICES': { category: 'Uncategorized', subcategory: null },
    'GOVERNMENT_AND_NON_PROFIT': { category: 'Taxes', subcategory: null },
    'TRANSPORTATION': { category: 'Transportation', subcategory: null },
    'TRAVEL': { category: 'Travel', subcategory: null },
    'RENT_AND_UTILITIES': { category: 'Housing', subcategory: 'Rent' },
  };

  return mapping[primary] ?? { category: 'Uncategorized', subcategory: null };
}

/**
 * Find the account in result.json that matches a Plaid account.
 */
function findMatchingAccount(
  accounts: ResultAccount[],
  plaidAccount: PlaidAccount
): ResultAccount | undefined {
  const plaidType = mapAccountType(plaidAccount.type, plaidAccount.subtype);
  const plaidMask = plaidAccount.mask ?? '';

  return accounts.find((a) => {
    const pdfType = a.account.accountType.toLowerCase();
    const pdfMask = a.account.accountNumberMasked.replace(/\*/g, '');
    return pdfType === plaidType && (pdfMask === plaidMask || plaidMask === '');
  });
}

/**
 * Merge Plaid data into a result.json structure.
 *
 * @param resultJson - The parsed result.json content
 * @param reconciliation - The reconciliation result from reconcileTransactions()
 * @param plaidAccounts - Plaid account metadata
 * @returns The merged result and statistics
 */
export function mergePlaidData(
  resultJson: ResultJson,
  reconciliation: ReconciliationResult,
  plaidAccounts: PlaidAccount[]
): MergeResult {
  // Deep clone to avoid mutating the original
  const result: ResultJson = JSON.parse(JSON.stringify(resultJson)) as ResultJson;

  let updated = 0;
  let added = 0;
  let accountsCreated = 0;

  // Build a map of PDF transactionId → account index + transaction index
  const pdfTxIndex = new Map<string, { accountIdx: number; txIdx: number }>();
  for (let ai = 0; ai < result.accounts.length; ai++) {
    const account = result.accounts[ai];
    if (account === undefined) continue;
    for (let ti = 0; ti < account.transactions.length; ti++) {
      const tx = account.transactions[ti];
      if (tx === undefined) continue;
      pdfTxIndex.set(`${tx.date}|${Math.abs(tx.amount)}|${tx.description}`, { accountIdx: ai, txIdx: ti });
      if (tx.transactionId !== undefined) {
        pdfTxIndex.set(tx.transactionId, { accountIdx: ai, txIdx: ti });
      }
    }
  }

  // Step 1: UPDATE matched transactions with Plaid enrichment
  for (const match of reconciliation.matched) {
    const pdfTx = match.pdfTransaction;
    const plaidTx = match.plaidTransaction;

    // Find the transaction in result.json by multiple keys
    const lookupKey = pdfTx.transactionId ?? `${pdfTx.date}|${Math.abs(pdfTx.amount)}|${pdfTx.description}`;
    const location = pdfTxIndex.get(lookupKey)
      ?? pdfTxIndex.get(`${pdfTx.date}|${Math.abs(pdfTx.amount)}|${pdfTx.description}`);

    if (location !== undefined) {
      const account = result.accounts[location.accountIdx];
      if (account !== undefined) {
        const tx = account.transactions[location.txIdx];
        if (tx !== undefined) {
          // Enrich with Plaid data
          tx.plaid = buildEnrichment(plaidTx);

          // Update postedDate if Plaid has it
          if (plaidTx.authorizedDate !== undefined) {
            tx.postedDate = plaidTx.authorizedDate;
          }

          // If Plaid has a better merchant name, add it to enrichment (keep original)
          // Update category if Plaid has higher confidence
          if (plaidTx.personalFinanceCategory !== undefined) {
            const plaidCat = mapPlaidPrimaryCategory(plaidTx.personalFinanceCategory.primary);
            const plaidConfidenceLevel = plaidTx.personalFinanceCategory.confidenceLevel;
            const plaidConfidence = plaidConfidenceLevel === 'VERY_HIGH' ? 0.98
              : plaidConfidenceLevel === 'HIGH' ? 0.95
              : plaidConfidenceLevel === 'MEDIUM' ? 0.85
              : 0.7;

            // Only override if Plaid is more confident
            if (plaidConfidence > tx.confidence) {
              tx.category = plaidCat.category;
              tx.subcategory = plaidCat.subcategory;
              tx.confidence = plaidConfidence;
            }
          }

          updated++;
        }
      }
    }
  }

  // Step 2: ADD unmatched Plaid transactions
  // Build a Plaid accountId → PlaidAccount map
  const plaidAccountMap = new Map<string, PlaidAccount>();
  for (const acc of plaidAccounts) {
    plaidAccountMap.set(acc.accountId, acc);
  }

  for (const plaidTx of reconciliation.unmatchedPlaid) {
    const plaidAccount = plaidAccountMap.get(plaidTx.accountId);
    const plaidType = plaidAccount !== undefined
      ? mapAccountType(plaidAccount.type, plaidAccount.subtype)
      : 'checking';

    // Find or create the target account in result.json
    let targetAccount = plaidAccount !== undefined
      ? findMatchingAccount(result.accounts, plaidAccount)
      : result.accounts[0];

    if (targetAccount === undefined) {
      // CREATE new account
      const mask = plaidAccount?.mask ?? '0000';

      // Determine date range from the unmatched Plaid transactions for this account
      const accountTxDates = reconciliation.unmatchedPlaid
        .filter((t) => t.accountId === plaidTx.accountId)
        .map((t) => t.date)
        .sort();

      const startDate = accountTxDates[0] ?? plaidTx.date;
      const endDate = accountTxDates[accountTxDates.length - 1] ?? plaidTx.date;

      targetAccount = {
        account: {
          institution: 'Bank of America',
          accountType: plaidType,
          accountNumberMasked: `****${mask}`,
          statementPeriod: { start: startDate, end: endDate },
          currency: 'USD',
        },
        summary: {
          startingBalance: 0,
          endingBalance: 0,
          totalCredits: 0,
          totalDebits: 0,
        },
        transactions: [],
      };
      result.accounts.push(targetAccount);
      accountsCreated++;
    }

    // Build statement ID and period label
    const statementId = `PLAID-${plaidType}-${plaidAccount?.mask ?? '0000'}-${plaidTx.date.slice(0, 7)}`;
    const periodLabel = `Plaid ${plaidType} ${plaidAccount?.mask ?? ''}`;

    const newTx = plaidToResultTransaction(plaidTx, plaidAccount, statementId, periodLabel);
    targetAccount.transactions.push(newTx);
    added++;
  }

  // Sort transactions by date within each account
  for (const account of result.accounts) {
    account.transactions.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Update totals
  const totalTransactions = result.accounts.reduce((sum, a) => sum + a.transactions.length, 0);
  result.totalTransactions = totalTransactions;
  result.totalStatements = result.accounts.length;

  const stats: MergeStats = {
    totalPdfTransactions: reconciliation.summary.totalPdf,
    totalPlaidTransactions: reconciliation.summary.totalPlaid,
    updated,
    added,
    accountsCreated,
    unmatchedPdf: reconciliation.summary.unmatchedPdfCount,
    unmatchedPlaid: 0, // All unmatched Plaid were added
    matchRate: reconciliation.summary.matchRate,
  };

  return { result, stats };
}

/**
 * Format a human-readable merge report.
 */
export function formatMergeReport(stats: MergeStats): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('=== Plaid Merge Report ===');
  lines.push('');
  lines.push('Source Data:');
  lines.push(`  PDF Transactions:     ${stats.totalPdfTransactions}`);
  lines.push(`  Plaid Transactions:   ${stats.totalPlaidTransactions}`);
  lines.push('');
  lines.push('Merge Actions:');
  lines.push(`  Updated (enriched):   ${stats.updated}`);
  lines.push(`  Added (new):          ${stats.added}`);
  lines.push(`  Accounts created:     ${stats.accountsCreated}`);
  lines.push('');
  lines.push('Result:');
  lines.push(`  Match Rate:           ${(stats.matchRate * 100).toFixed(1)}%`);
  lines.push(`  Total Transactions:   ${stats.totalPdfTransactions + stats.added}`);
  lines.push(`  Unmatched PDF:        ${stats.unmatchedPdf}`);
  lines.push('');
  return lines.join('\n');
}
