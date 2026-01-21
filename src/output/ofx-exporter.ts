/**
 * OFX Exporter Module
 * 
 * Converts v2 rollup output to OFX (Open Financial Exchange) text format.
 * Uses transactionId as FITID for OFX compatibility.
 */

import type { FinalResultV2 } from './adapters.js';
import { computeTransactionId } from '../utils/id-generator.js';

/**
 * OFX transaction type mapping
 */
type OfxTransactionType = 'CREDIT' | 'DEBIT' | 'OTHER';

/**
 * Options for OFX export
 */
export interface OfxExportOptions {
  /** Include OFX header (default: true) */
  includeHeader?: boolean;
  /** Bank ID for OFX (default: '121000358' - Bank of America routing) */
  bankId?: string;
  /** Organization name (default: 'Bank of America') */
  org?: string;
  /** Financial Institution ID (default: '5959') */
  fid?: string;
}

/**
 * Format a date string (YYYY-MM-DD) to OFX DTPOSTED format (YYYYMMDD)
 */
function formatOfxDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

/**
 * Format amount for OFX (signed, credit positive, debit negative)
 */
function formatOfxAmount(amount: number, direction: 'credit' | 'debit'): string {
  const absAmount = Math.abs(amount);
  const signedAmount = direction === 'credit' ? absAmount : -absAmount;
  return signedAmount.toFixed(2);
}

/**
 * Get OFX transaction type from direction
 */
function getOfxTransactionType(direction: 'credit' | 'debit'): OfxTransactionType {
  return direction === 'credit' ? 'CREDIT' : 'DEBIT';
}

/**
 * Escape special characters for OFX (XML-like)
 */
function escapeOfx(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Truncate string to max length for OFX fields
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength);
}

/**
 * Ensure string is ASCII-safe for OFX
 */
function toAsciiSafe(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, '?');
}

/**
 * Generate OFX header
 */
function generateOfxHeader(): string {
  const now = new Date();
  const dtServer = now.toISOString().replace(/[-:T]/g, '').substring(0, 14);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<DTSERVER>${dtServer}</DTSERVER>
<LANGUAGE>ENG</LANGUAGE>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>`;
}

/**
 * Generate OFX footer
 */
function generateOfxFooter(): string {
  return `</BANKMSGSRSV1>
</OFX>`;
}

/**
 * Account type mapping for OFX
 */
function getOfxAccountType(accountType: string): string {
  const mapping: Record<string, string> = {
    checking: 'CHECKING',
    savings: 'SAVINGS',
    credit: 'CREDITLINE',
  };
  return mapping[accountType.toLowerCase()] ?? 'CHECKING';
}

/**
 * Transaction data for OFX export
 */
interface OfxTransaction {
  date: string;
  postedDate: string | null;
  description: string;
  merchant: string;
  amount: number;
  direction: 'credit' | 'debit';
  transactionId?: string;
  statementId?: string;
  raw?: {
    originalText: string;
    page: number;
  };
}

/**
 * Generate OFX for a single transaction
 */
function generateTransactionOfx(txn: OfxTransaction, statementId: string): string {
  const dtPosted = formatOfxDate(txn.postedDate ?? txn.date);
  const trnAmt = formatOfxAmount(txn.amount, txn.direction);
  const trnType = getOfxTransactionType(txn.direction);
  
  // Use existing transactionId or compute one
  let fitId = txn.transactionId;
  if ((fitId === undefined || fitId === null || fitId === '') && txn.raw) {
    fitId = computeTransactionId(
      {
        date: txn.date,
        postedDate: txn.postedDate,
        direction: txn.direction,
        amount: txn.amount,
        description: txn.description,
        merchant: txn.merchant,
        raw: txn.raw,
      },
      statementId
    );
  }
  fitId = fitId ?? `tx_${Date.now().toString(16)}`;
  
  // NAME: merchant if present and non-empty, else description (max 32 chars)
  const nameSource = txn.merchant !== null && txn.merchant !== '' ? txn.merchant : txn.description;
  const name = truncate(toAsciiSafe(escapeOfx(nameSource)), 32);
  
  // MEMO: full description (max 255 chars)
  const memo = truncate(toAsciiSafe(escapeOfx(txn.description)), 255);
  
  return `<STMTTRN>
<TRNTYPE>${trnType}</TRNTYPE>
<DTPOSTED>${dtPosted}</DTPOSTED>
<TRNAMT>${trnAmt}</TRNAMT>
<FITID>${fitId}</FITID>
<NAME>${name}</NAME>
<MEMO>${memo}</MEMO>
</STMTTRN>`;
}

/**
 * Generate OFX for an account block
 */
function generateAccountOfx(
  account: FinalResultV2['accounts'][number],
  bankId: string
): string {
  const acctType = getOfxAccountType(account.account.accountType);
  const acctId = account.account.accountNumberMasked.replace(/\*/g, 'X');
  const dtStart = formatOfxDate(account.account.statementPeriod.start);
  const dtEnd = formatOfxDate(account.account.statementPeriod.end);
  
  // Sort transactions by date for deterministic output
  const sortedTransactions = [...account.transactions].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.transactionId.localeCompare(b.transactionId);
  });
  
  const transactionsOfx = sortedTransactions
    .map((txn) => generateTransactionOfx(txn, txn.statementId))
    .join('\n');
  
  return `<STMTTRNRS>
<TRNUID>0</TRNUID>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<STMTRS>
<CURDEF>${account.account.currency}</CURDEF>
<BANKACCTFROM>
<BANKID>${bankId}</BANKID>
<ACCTID>${acctId}</ACCTID>
<ACCTTYPE>${acctType}</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${dtStart}</DTSTART>
<DTEND>${dtEnd}</DTEND>
${transactionsOfx}
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>${account.summary.endingBalance.toFixed(2)}</BALAMT>
<DTASOF>${dtEnd}</DTASOF>
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>`;
}

/**
 * Export v2 rollup to OFX format.
 * 
 * @param v2Result - The v2 rollup result to export
 * @param options - Export options
 * @returns OFX text string
 */
export function exportOfx(
  v2Result: FinalResultV2,
  options: OfxExportOptions = {}
): string {
  const {
    includeHeader = true,
    bankId = '121000358',
  } = options;
  
  const parts: string[] = [];
  
  if (includeHeader) {
    parts.push(generateOfxHeader());
  }
  
  // Generate OFX for each account
  for (const account of v2Result.accounts) {
    parts.push(generateAccountOfx(account, bankId));
  }
  
  if (includeHeader) {
    parts.push(generateOfxFooter());
  }
  
  return parts.join('\n');
}

/**
 * Export a single account block to OFX format.
 * 
 * @param accountBlock - Single account block from v2 result
 * @param options - Export options
 * @returns OFX text string
 */
export function exportAccountOfx(
  accountBlock: FinalResultV2['accounts'][number],
  options: OfxExportOptions = {}
): string {
  const {
    includeHeader = true,
    bankId = '121000358',
  } = options;
  
  const parts: string[] = [];
  
  if (includeHeader) {
    parts.push(generateOfxHeader());
  }
  
  parts.push(generateAccountOfx(accountBlock, bankId));
  
  if (includeHeader) {
    parts.push(generateOfxFooter());
  }
  
  return parts.join('\n');
}
