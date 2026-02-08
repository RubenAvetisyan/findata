/**
 * Plaid enricher adapter for merging Plaid transaction data into PDF-parsed output.
 * Enriches FinalResultV2 with Plaid metadata, reconciliation summaries, and transaction matches.
 */

import type { FinalResultV2 } from './adapters.js';
import type { PlaidTransaction, PlaidAccount, PlaidItem } from '../plaid/types.js';
import type {
  DataSources,
  ReconciliationSummary,
  PlaidMatch,
  PlaidMatchType,
  Transaction,
} from '../types/output.js';
import {
  reconcileTransactions,
  type ReconcileOptions,
  type ReconciliationMatch,
} from '../plaid/reconcile.js';
import {
  normalizeTransactions,
  mapAccountType,
  generatePlaidStatementId,
} from '../plaid/normalizer.js';

export type MergeStrategy = 'pdf-primary' | 'plaid-primary' | 'union';

/** V2 transaction format */
type V2Transaction = FinalResultV2['accounts'][number]['transactions'][number];

/** V2 account rollup format */
type AccountRollup = FinalResultV2['accounts'][number];

/**
 * Convert a canonical Transaction to V2 transaction format.
 */
function convertToV2Transaction(tx: Transaction, plaidAccount: PlaidAccount): V2Transaction {
  const accountType = mapAccountType(plaidAccount.type, plaidAccount.subtype);
  const mask = plaidAccount.mask ?? '0000';
  const statementId = generatePlaidStatementId(accountType, mask, tx.date);
  const periodLabel = `${tx.date.slice(0, 7)} ${plaidAccount.name} (Plaid)`;

  return {
    date: tx.date,
    postedDate: tx.postedDate,
    description: tx.description,
    merchant: tx.merchant?.name ?? tx.description,
    amount: tx.amount,
    direction: tx.direction,
    category: tx.categorization?.category ?? 'Uncategorized',
    subcategory: tx.categorization?.subcategory ?? null,
    confidence: tx.categorization?.confidence ?? 0.5,
    statementId,
    periodLabel,
    transactionId: tx.transactionId,
    raw: {
      originalText: tx.raw?.originalText ?? tx.description,
      page: tx.raw?.page ?? 0,
    },
  };
}

export interface EnrichOptions {
  mergeStrategy?: MergeStrategy;
  includeUnmatchedPlaid?: boolean;
  dateToleranceDays?: number;
  amountTolerancePercent?: number;
  merchantSimilarityThreshold?: number;
  pdfFiles?: string[];
  parseDate?: string;
}

export interface EnrichResult {
  enrichedOutput: FinalResultV2 & {
    dataSources?: DataSources;
    reconciliation?: ReconciliationSummary;
  };
  reconciliation: ReconciliationSummary;
  warnings: string[];
}

const DEFAULT_OPTIONS: Required<Omit<EnrichOptions, 'pdfFiles' | 'parseDate'>> & {
  pdfFiles: string[];
  parseDate: string;
} = {
  mergeStrategy: 'pdf-primary',
  includeUnmatchedPlaid: true,
  dateToleranceDays: 3,
  amountTolerancePercent: 0.01,
  merchantSimilarityThreshold: 0.6,
  pdfFiles: [],
  parseDate: new Date().toISOString(),
};

/**
 * Convert a reconciliation match to a PlaidMatch object for transaction enrichment.
 */
function toPlaidMatch(match: ReconciliationMatch): PlaidMatch {
  const plaidTx = match.plaidTransaction;

  const result: PlaidMatch = {
    plaidTransactionId: plaidTx.transactionId,
    matchConfidence: match.confidence,
    matchType: match.matchType as PlaidMatchType,
    differences: match.differences,
  };

  if (plaidTx.merchantName !== undefined) {
    result.merchantName = plaidTx.merchantName;
  }

  if (plaidTx.location !== undefined) {
    const loc: PlaidMatch['location'] = {};
    if (plaidTx.location.city !== undefined) loc.city = plaidTx.location.city;
    if (plaidTx.location.region !== undefined) loc.state = plaidTx.location.region;
    if (plaidTx.location.country !== undefined) loc.country = plaidTx.location.country;
    if (Object.keys(loc).length > 0) {
      result.location = loc;
    }
  }

  if (plaidTx.personalFinanceCategory !== undefined) {
    result.personalFinanceCategory = {
      primary: plaidTx.personalFinanceCategory.primary,
      detailed: plaidTx.personalFinanceCategory.detailed,
    };
  }

  return result;
}

/**
 * Build match breakdown from reconciliation matches.
 */
function buildMatchBreakdown(matches: ReconciliationMatch[]): ReconciliationSummary['matchBreakdown'] {
  const breakdown = {
    exact: 0,
    fuzzy: 0,
    amountDate: 0,
    amountOnly: 0,
  };

  for (const match of matches) {
    switch (match.matchType) {
      case 'exact':
        breakdown.exact++;
        break;
      case 'fuzzy':
        breakdown.fuzzy++;
        break;
      case 'amount_date':
        breakdown.amountDate++;
        break;
      case 'amount_only':
        breakdown.amountOnly++;
        break;
    }
  }

  return breakdown;
}

/**
 * Create a ReconciliationSummary from reconciliation result.
 */
function createReconciliationSummary(
  matches: ReconciliationMatch[],
  unmatchedPdfCount: number,
  unmatchedPlaidCount: number,
  totalPdfAmount: number,
  totalPlaidAmount: number,
  totalPdfCount: number
): ReconciliationSummary {
  return {
    matched: matches.length,
    unmatchedPdf: unmatchedPdfCount,
    unmatchedPlaid: unmatchedPlaidCount,
    matchRate: totalPdfCount > 0 ? matches.length / totalPdfCount : 0,
    totalPdfAmount,
    totalPlaidAmount,
    amountDifference: totalPdfAmount - totalPlaidAmount,
    matchBreakdown: buildMatchBreakdown(matches),
  };
}

/**
 * Enrich PDF-parsed output with Plaid transaction data.
 *
 * @param pdfOutput - The FinalResultV2 output from PDF parsing
 * @param plaidTransactions - Plaid transactions to match against
 * @param plaidAccounts - Plaid account information
 * @param plaidItem - Optional Plaid item for metadata
 * @param options - Enrichment options
 * @returns Enriched output with reconciliation summary
 */
export function enrichWithPlaid(
  pdfOutput: FinalResultV2,
  plaidTransactions: PlaidTransaction[],
  plaidAccounts: PlaidAccount[],
  plaidItem?: PlaidItem,
  options: EnrichOptions = {}
): EnrichResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];

  // Collect all PDF transactions for reconciliation
  const pdfTransactions: Array<{
    transactionId: string;
    date: string;
    amount: number;
    description: string;
    merchant: string;
    accountIndex: number;
    txIndex: number;
  }> = [];

  for (let accountIndex = 0; accountIndex < pdfOutput.accounts.length; accountIndex++) {
    const account = pdfOutput.accounts[accountIndex];
    if (account === undefined) continue;

    for (let txIndex = 0; txIndex < account.transactions.length; txIndex++) {
      const tx = account.transactions[txIndex];
      if (tx === undefined) continue;

      pdfTransactions.push({
        transactionId: tx.transactionId,
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        merchant: tx.merchant,
        accountIndex,
        txIndex,
      });
    }
  }

  // Run reconciliation
  const reconcileOpts: ReconcileOptions = {
    dateToleranceDays: opts.dateToleranceDays,
    amountTolerancePercent: opts.amountTolerancePercent,
    merchantSimilarityThreshold: opts.merchantSimilarityThreshold,
  };

  const reconcileResult = reconcileTransactions(pdfTransactions, plaidTransactions, reconcileOpts);

  // Build match lookup by PDF transaction ID
  const matchByPdfTxId = new Map<string, ReconciliationMatch>();
  for (const match of reconcileResult.matched) {
    const pdfTx = match.pdfTransaction;
    if (pdfTx.transactionId !== undefined) {
      matchByPdfTxId.set(pdfTx.transactionId, match);
    }
  }

  // Deep clone the output for enrichment
  const enrichedOutput = JSON.parse(JSON.stringify(pdfOutput)) as FinalResultV2 & {
    dataSources?: DataSources;
    reconciliation?: ReconciliationSummary;
  };

  // Enrich transactions with plaidMatch
  for (const account of enrichedOutput.accounts) {
    for (const tx of account.transactions) {
      const match = matchByPdfTxId.get(tx.transactionId);
      if (match !== undefined) {
        (tx as typeof tx & { plaidMatch?: PlaidMatch }).plaidMatch = toPlaidMatch(match);
      }
    }
  }

  // Handle merge strategies
  if (opts.mergeStrategy === 'union' && reconcileResult.unmatchedPlaid.length > 0) {
    // Add unmatched Plaid transactions to output
    const unmatchedPlaidTxs = reconcileResult.unmatchedPlaid;
    
    // Convert Plaid transactions to canonical format
    const normalizedPlaidTxs = normalizeTransactions(unmatchedPlaidTxs, plaidAccounts);
    
    // Group by account
    const plaidTxsByAccount = new Map<string, Transaction[]>();
    for (let i = 0; i < unmatchedPlaidTxs.length; i++) {
      const plaidTx = unmatchedPlaidTxs[i];
      const normalizedTx = normalizedPlaidTxs[i];
      if (plaidTx === undefined || normalizedTx === undefined) continue;
      
      const accountId = plaidTx.accountId;
      if (!plaidTxsByAccount.has(accountId)) {
        plaidTxsByAccount.set(accountId, []);
      }
      plaidTxsByAccount.get(accountId)?.push(normalizedTx);
    }
    
    // Add to existing accounts or create new account rollups
    for (const [accountId, txs] of plaidTxsByAccount) {
      const plaidAccount = plaidAccounts.find((a) => a.accountId === accountId);
      if (plaidAccount === undefined) continue;
      
      const accountType = mapAccountType(plaidAccount.type, plaidAccount.subtype);
      const mask = plaidAccount.mask ?? '0000';
      
      // Find existing account rollup with matching mask
      const existingAccount = enrichedOutput.accounts.find(
        (a) => a.account.accountNumberMasked?.endsWith(mask)
      );
      
      if (existingAccount !== undefined) {
        // Add transactions to existing account
        const v2Txs = txs.map((tx) => convertToV2Transaction(tx, plaidAccount));
        existingAccount.transactions.push(...v2Txs);
        existingAccount.totalTransactions += v2Txs.length;
      } else {
        // Create new account rollup for Plaid-only transactions
        const newAccountRollup: AccountRollup = {
          account: {
            institution: plaidItem?.institutionName ?? 'Plaid',
            accountType,
            accountNumberMasked: `****${mask}`,
            statementPeriod: {
              start: txs.reduce((min, tx) => tx.date < min ? tx.date : min, txs[0]?.date ?? ''),
              end: txs.reduce((max, tx) => tx.date > max ? tx.date : max, txs[0]?.date ?? ''),
            },
            currency: 'USD',
          },
          summary: {
            startingBalance: 0,
            endingBalance: 0,
            totalCredits: txs.filter((t) => t.direction === 'credit').reduce((sum, t) => sum + t.amount, 0),
            totalDebits: txs.filter((t) => t.direction === 'debit').reduce((sum, t) => sum + t.amount, 0),
          },
          transactions: txs.map((tx) => convertToV2Transaction(tx, plaidAccount)),
          totalStatements: 1,
          totalTransactions: txs.length,
        };
        
        enrichedOutput.accounts.push(newAccountRollup);
      }
    }
    
    // Update totals
    enrichedOutput.totalTransactions = enrichedOutput.accounts.reduce(
      (sum, a) => sum + a.totalTransactions,
      0
    );
    
    warnings.push(
      `Added ${normalizedPlaidTxs.length} unmatched Plaid transactions to output (union merge).`
    );
  } else if (opts.mergeStrategy === 'plaid-primary') {
    // In plaid-primary mode, prefer Plaid data for matched transactions
    for (const account of enrichedOutput.accounts) {
      for (const tx of account.transactions) {
        const match = matchByPdfTxId.get(tx.transactionId);
        if (match !== undefined) {
          const plaidTx = match.plaidTransaction;
          // Update merchant with Plaid's cleaner name if available
          if (plaidTx.merchantName !== undefined) {
            tx.merchant = plaidTx.merchantName;
          }
        }
      }
    }
  }

  // Calculate totals for reconciliation summary
  const totalPdfAmount = pdfTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const totalPlaidAmount = plaidTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const reconciliation = createReconciliationSummary(
    reconcileResult.matched,
    reconcileResult.unmatchedPdf.length,
    reconcileResult.unmatchedPlaid.length,
    totalPdfAmount,
    totalPlaidAmount,
    pdfTransactions.length
  );

  // Add dataSources metadata
  const dataSources: DataSources = {
    pdf: {
      files: opts.pdfFiles,
      transactionCount: pdfTransactions.length,
      parseDate: opts.parseDate,
    },
  };

  if (plaidItem !== undefined) {
    const plaidSource: DataSources['plaid'] = {
      itemId: plaidItem.itemId,
      institutionName: plaidItem.institutionName,
      transactionCount: plaidTransactions.length,
      syncDate: plaidItem.lastSyncAt ?? new Date().toISOString(),
    };
    if (plaidItem.syncCursor !== undefined) {
      plaidSource.cursor = plaidItem.syncCursor;
    }
    dataSources.plaid = plaidSource;
  } else if (plaidAccounts.length > 0) {
    // Fallback if no item provided
    const firstAccount = plaidAccounts[0];
    dataSources.plaid = {
      itemId: firstAccount?.itemId ?? 'unknown',
      institutionName: 'Unknown Institution',
      transactionCount: plaidTransactions.length,
      syncDate: new Date().toISOString(),
    };
  }

  enrichedOutput.dataSources = dataSources;
  enrichedOutput.reconciliation = reconciliation;

  // Add warnings for low match rate
  if (reconciliation.matchRate < 0.5 && pdfTransactions.length > 0) {
    warnings.push(
      `Low match rate: ${(reconciliation.matchRate * 100).toFixed(1)}%. ` +
        `Consider adjusting tolerance settings or verifying date ranges overlap.`
    );
  }

  // Add warning for significant amount difference
  const amountDiffPercent =
    totalPdfAmount > 0 ? Math.abs(reconciliation.amountDifference) / totalPdfAmount : 0;
  if (amountDiffPercent > 0.1 && pdfTransactions.length > 0) {
    warnings.push(
      `Significant amount difference: $${Math.abs(reconciliation.amountDifference).toFixed(2)} ` +
        `(${(amountDiffPercent * 100).toFixed(1)}% of PDF total).`
    );
  }

  return {
    enrichedOutput,
    reconciliation,
    warnings,
  };
}

/**
 * Check if a FinalResultV2 has been enriched with Plaid data.
 */
export function isPlaidEnriched(
  output: FinalResultV2
): output is FinalResultV2 & { dataSources: DataSources; reconciliation: ReconciliationSummary } {
  const enriched = output as FinalResultV2 & {
    dataSources?: DataSources;
    reconciliation?: ReconciliationSummary;
  };
  return enriched.dataSources?.plaid !== undefined && enriched.reconciliation !== undefined;
}

/**
 * Get Plaid match statistics from an enriched output.
 */
export function getPlaidMatchStats(output: FinalResultV2): {
  totalTransactions: number;
  matchedTransactions: number;
  matchRate: number;
  byMatchType: Record<PlaidMatchType, number>;
} {
  let totalTransactions = 0;
  let matchedTransactions = 0;
  const byMatchType: Record<PlaidMatchType, number> = {
    exact: 0,
    fuzzy: 0,
    amount_date: 0,
    amount_only: 0,
  };

  for (const account of output.accounts) {
    for (const tx of account.transactions) {
      totalTransactions++;
      const txWithMatch = tx as typeof tx & { plaidMatch?: PlaidMatch };
      if (txWithMatch.plaidMatch !== undefined) {
        matchedTransactions++;
        byMatchType[txWithMatch.plaidMatch.matchType]++;
      }
    }
  }

  return {
    totalTransactions,
    matchedTransactions,
    matchRate: totalTransactions > 0 ? matchedTransactions / totalTransactions : 0,
    byMatchType,
  };
}
