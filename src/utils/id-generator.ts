/**
 * Deterministic ID Generation Utilities (OFX-grade)
 * 
 * Provides stable, reproducible identifiers for statements and transactions
 * that can be used as OFX FITIDs.
 */

import { createHash } from 'crypto';

/**
 * Normalize institution name for ID generation.
 * Maps common variations to canonical short form.
 */
function normalizeInstitution(institution: string): string {
  const normalized = institution.trim().toUpperCase().replace(/\s+/g, ' ');
  
  // Map known institutions to short codes
  const institutionMap: Record<string, string> = {
    'BANK OF AMERICA': 'BOA',
    'BANK OF AMERICA, N.A.': 'BOA',
    'BOFA': 'BOA',
  };
  
  return institutionMap[normalized] ?? normalized.replace(/\s+/g, '_');
}

/**
 * Normalize account type for ID generation.
 */
function normalizeAccountType(accountType: string): string {
  return accountType.toLowerCase().trim();
}

/**
 * Compute a deterministic statement ID.
 * 
 * Format: <institution>-<accountType>-<masked>-<start>-<end>
 * Example: BOA-checking-****3529-2025-03-11-2025-04-09
 * 
 * @param statement - Statement data containing account info
 * @returns Deterministic statement ID string
 */
export function computeStatementId(statement: {
  account: {
    institution: string;
    accountType: string;
    accountNumberMasked: string;
    statementPeriod: {
      start: string;
      end: string;
    };
  };
}): string {
  const institution = normalizeInstitution(statement.account.institution);
  const accountType = normalizeAccountType(statement.account.accountType);
  const masked = statement.account.accountNumberMasked;
  const start = statement.account.statementPeriod.start;
  const end = statement.account.statementPeriod.end;
  
  return `${institution}-${accountType}-${masked}-${start}-${end}`;
}

/**
 * Compute a human-readable period label.
 * 
 * Format: "YYYY-MM <institution> <accountType>" for single-month periods
 * Format: "YYYY-MM-DD..YYYY-MM-DD <institution> <accountType>" for multi-month periods
 * 
 * @param statement - Statement data containing account info
 * @returns Human-readable period label
 */
export function computePeriodLabel(statement: {
  account: {
    institution: string;
    accountType: string;
    statementPeriod: {
      start: string;
      end: string;
    };
  };
}): string {
  const institution = normalizeInstitution(statement.account.institution);
  const accountType = capitalize(statement.account.accountType);
  const start = statement.account.statementPeriod.start;
  const end = statement.account.statementPeriod.end;
  
  // Check if same month
  const startMonth = start.substring(0, 7); // YYYY-MM
  const endMonth = end.substring(0, 7);
  
  if (startMonth === endMonth) {
    return `${startMonth} ${institution} ${accountType}`;
  }
  
  return `${start}..${end} ${institution} ${accountType}`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Normalize a string for canonical hashing.
 * - Trim whitespace
 * - Collapse multiple spaces
 * - Convert to uppercase for consistency
 */
function normalizeForHash(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Normalize amount for canonical hashing.
 * - Round to 2 decimal places
 * - Fixed formatting
 */
function normalizeAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Transaction data required for ID computation.
 */
export interface TransactionIdInput {
  date: string;
  postedDate: string | null;
  direction: 'debit' | 'credit';
  amount: number;
  description: string;
  merchant: string | null;
  raw: {
    page: number;
    originalText: string;
  };
}

/**
 * Compute a deterministic transaction ID (OFX FITID-equivalent).
 * 
 * Uses SHA-256 hash of canonical string:
 * statementId | date | postedDate | direction | amount | description | merchant | page | originalText
 * 
 * Output: "tx_" + first 24 hex chars of hash
 * 
 * @param transaction - Transaction data
 * @param statementId - Parent statement ID
 * @returns Deterministic transaction ID string (27 chars: "tx_" + 24 hex)
 */
export function computeTransactionId(
  transaction: TransactionIdInput,
  statementId: string
): string {
  const canonicalParts = [
    statementId,
    transaction.date,
    transaction.postedDate ?? '',
    transaction.direction,
    normalizeAmount(transaction.amount),
    normalizeForHash(transaction.description),
    normalizeForHash(transaction.merchant),
    String(transaction.raw.page),
    normalizeForHash(transaction.raw.originalText),
  ];
  
  const canonicalString = canonicalParts.join('|');
  
  const hash = createHash('sha256')
    .update(canonicalString, 'utf8')
    .digest('hex');
  
  // Return first 24 hex chars with prefix
  return `tx_${hash.substring(0, 24)}`;
}

/**
 * Batch compute transaction IDs for all transactions in a statement.
 * 
 * @param transactions - Array of transactions
 * @param statementId - Parent statement ID
 * @returns Map of transaction index to transaction ID
 */
export function computeTransactionIds(
  transactions: TransactionIdInput[],
  statementId: string
): Map<number, string> {
  const ids = new Map<number, string>();
  
  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    if (txn !== undefined) {
      ids.set(i, computeTransactionId(txn, statementId));
    }
  }
  
  return ids;
}

/**
 * Validate that a transaction ID is well-formed.
 * Must be ASCII, no spaces, reasonable length for OFX FITID.
 */
export function isValidTransactionId(id: string): boolean {
  // Must start with tx_
  if (!id.startsWith('tx_')) {
    return false;
  }
  
  // Must be exactly 27 chars (tx_ + 24 hex)
  if (id.length !== 27) {
    return false;
  }
  
  // Must be ASCII alphanumeric + underscore only
  if (!/^tx_[a-f0-9]{24}$/.test(id)) {
    return false;
  }
  
  return true;
}

/**
 * Validate that a statement ID is well-formed.
 */
export function isValidStatementId(id: string): boolean {
  // Must be non-empty ASCII string with no spaces (hyphens allowed)
  if (!id || id.length === 0) {
    return false;
  }
  
  // Must not contain spaces
  if (/\s/.test(id)) {
    return false;
  }
  
  // Must be printable ASCII
  if (!/^[\x20-\x7E]+$/.test(id)) {
    return false;
  }
  
  return true;
}
