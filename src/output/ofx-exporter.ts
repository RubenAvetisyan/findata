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
 * See OFX spec: https://www.ofx.net/downloads/OFX%202.2.pdf
 */
type OfxTransactionType = 
  | 'CREDIT'   // Generic credit
  | 'DEBIT'    // Generic debit
  | 'DEP'      // Deposit
  | 'ATM'      // ATM debit or credit
  | 'POS'      // Point of sale debit or credit
  | 'XFER'     // Transfer
  | 'CHECK'    // Check
  | 'PAYMENT'  // Electronic payment
  | 'FEE'      // FI fee
  | 'SRVCHG'   // Service charge
  | 'INT'      // Interest earned or paid
  | 'DIV'      // Dividend
  | 'OTHER';   // Other

/**
 * Result of TRNTYPE detection including optional check number
 */
interface TrnTypeResult {
  trnType: OfxTransactionType;
  checkNum?: string;
}

/**
 * Detect specific OFX transaction type from description and direction
 */
function detectTrnType(description: string, direction: 'credit' | 'debit'): TrnTypeResult {
  const desc = description.toUpperCase();
  
  // Check detection - extract check number
  const checkMatch = desc.match(/CHECK\s*#?\s*(\d+)/i) || desc.match(/^(\d{1,6})\s*$/);
  const checkNum = checkMatch !== null ? checkMatch[1] : undefined;
  if (checkNum !== undefined && checkNum !== '') {
    return { trnType: 'CHECK', checkNum };
  }
  
  // ATM transactions
  if (desc.includes('ATM') || desc.includes('CASH WITHDRAWAL')) {
    return { trnType: 'ATM' };
  }
  
  // Transfers (Zelle, wire, internal transfers)
  if (desc.includes('ZELLE') || 
      desc.includes('TRANSFER') || 
      desc.includes('XFER') ||
      desc.includes('WIRE') ||
      desc.includes('ONLINE BANKING TRANSFER')) {
    return { trnType: 'XFER' };
  }
  
  // Deposits
  if (desc.includes('DEPOSIT') || 
      desc.includes('DIRECT DEP') ||
      desc.includes('PAYROLL') ||
      (direction === 'credit' && desc.includes('BOFA FIN CTR'))) {
    return { trnType: 'DEP' };
  }
  
  // Fees and service charges
  if (desc.includes('FEE') || 
      desc.includes('SERVICE CHARGE') ||
      desc.includes('MONTHLY MAINTENANCE') ||
      desc.includes('OVERDRAFT')) {
    return { trnType: direction === 'debit' ? 'FEE' : 'CREDIT' };
  }
  
  // Interest
  if (desc.includes('INTEREST')) {
    return { trnType: 'INT' };
  }
  
  // POS / Card purchases
  if (desc.includes('CHECKCARD') || 
      desc.includes('PURCHASE') ||
      desc.includes('POS') ||
      desc.includes('DEBIT CARD')) {
    return { trnType: 'POS' };
  }
  
  // Electronic payments
  if (desc.includes('PAYMENT') ||
      desc.includes('BILL PAY') ||
      desc.includes('ACH') ||
      desc.includes('AUTOPAY')) {
    return { trnType: 'PAYMENT' };
  }
  
  // Default to generic CREDIT/DEBIT
  return { trnType: direction === 'credit' ? 'CREDIT' : 'DEBIT' };
}

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
  /** Split into separate STMTTRNRS blocks per statement period (default: true) */
  splitByStatement?: boolean;
  /** Include AVAILBAL (available balance) same as LEDGERBAL (default: true) */
  includeAvailBal?: boolean;
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
  
  // Detect specific transaction type and check number
  const { trnType, checkNum } = detectTrnType(txn.description, txn.direction);
  
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
  
  // Optional CHECKNUM for check transactions
  const checkNumLine = checkNum !== undefined ? `\n<CHECKNUM>${checkNum}</CHECKNUM>` : '';
  
  return `<STMTTRN>
<TRNTYPE>${trnType}</TRNTYPE>
<DTPOSTED>${dtPosted}</DTPOSTED>
<TRNAMT>${trnAmt}</TRNAMT>
<FITID>${fitId}</FITID>${checkNumLine}
<NAME>${name}</NAME>
<MEMO>${memo}</MEMO>
</STMTTRN>`;
}

/**
 * Convert masked account number to numeric format for OFX compatibility.
 * Transforms ****3529 -> 00003529 (replaces * with 0)
 */
function toNumericAcctId(maskedAcct: string): string {
  return maskedAcct.replace(/\*/g, '0');
}

/**
 * Statement period info extracted from transactions
 */
interface StatementPeriodInfo {
  statementId: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  transactions: FinalResultV2['accounts'][number]['transactions'];
  endingBalance: number;
}

/**
 * Group transactions by statementId and extract period info
 */
function groupTransactionsByStatement(
  account: FinalResultV2['accounts'][number]
): StatementPeriodInfo[] {
  const groups = new Map<string, StatementPeriodInfo>();
  
  for (const txn of account.transactions) {
    const stmtId = txn.statementId;
    if (!groups.has(stmtId)) {
      // Parse period from statementId (format: BOA-type-****XXXX-YYYY-MM-DD-YYYY-MM-DD)
      const parts = stmtId.split('-');
      const startDate = parts.slice(-6, -3).join('-'); // YYYY-MM-DD
      const endDate = parts.slice(-3).join('-'); // YYYY-MM-DD
      
      groups.set(stmtId, {
        statementId: stmtId,
        periodLabel: txn.periodLabel,
        startDate,
        endDate,
        transactions: [],
        endingBalance: 0, // Will be calculated or use account's if single statement
      });
    }
    groups.get(stmtId)!.transactions.push(txn);
  }
  
  // Sort groups by start date and sort transactions within each group
  const sortedGroups = Array.from(groups.values()).sort((a, b) => 
    a.startDate.localeCompare(b.startDate)
  );
  
  for (const group of sortedGroups) {
    group.transactions.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.transactionId.localeCompare(b.transactionId);
    });
  }
  
  // If only one statement, use account's ending balance
  if (sortedGroups.length === 1 && sortedGroups[0] !== undefined) {
    sortedGroups[0].endingBalance = account.summary.endingBalance;
  } else {
    // For multiple statements, calculate running balance (approximate)
    // Note: This is an approximation since we don't have per-statement balances in v2
    let runningBalance = account.summary.startingBalance;
    for (const group of sortedGroups) {
      for (const txn of group.transactions) {
        runningBalance += txn.direction === 'credit' ? Math.abs(txn.amount) : -Math.abs(txn.amount);
      }
      group.endingBalance = runningBalance;
    }
  }
  
  return sortedGroups;
}

/**
 * Generate a single STMTTRNRS block for a statement period
 */
function generateStatementOfx(
  account: FinalResultV2['accounts'][number],
  period: StatementPeriodInfo,
  bankId: string,
  includeAvailBal: boolean
): string {
  const acctType = getOfxAccountType(account.account.accountType);
  const acctId = toNumericAcctId(account.account.accountNumberMasked);
  const dtStart = formatOfxDate(period.startDate);
  const dtEnd = formatOfxDate(period.endDate);
  const lastFour = account.account.accountNumberMasked.replace(/\*/g, '').slice(-4);
  const trnUid = `stmt_${dtStart}_${dtEnd}_${lastFour}`;
  
  const transactionsOfx = period.transactions
    .map((txn) => generateTransactionOfx(txn, txn.statementId))
    .join('\n');
  
  const availBalSection = includeAvailBal ? `
<AVAILBAL>
<BALAMT>${period.endingBalance.toFixed(2)}</BALAMT>
<DTASOF>${dtEnd}</DTASOF>
</AVAILBAL>` : '';
  
  return `<STMTTRNRS>
<TRNUID>${trnUid}</TRNUID>
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
<BALAMT>${period.endingBalance.toFixed(2)}</BALAMT>
<DTASOF>${dtEnd}</DTASOF>
</LEDGERBAL>${availBalSection}
</STMTRS>
</STMTTRNRS>`;
}

/**
 * Generate OFX for an account block (legacy single-block mode)
 */
function generateAccountOfxSingle(
  account: FinalResultV2['accounts'][number],
  bankId: string,
  includeAvailBal: boolean
): string {
  const acctType = getOfxAccountType(account.account.accountType);
  const acctId = toNumericAcctId(account.account.accountNumberMasked);
  const dtStart = formatOfxDate(account.account.statementPeriod.start);
  const dtEnd = formatOfxDate(account.account.statementPeriod.end);
  const lastFour = account.account.accountNumberMasked.replace(/\*/g, '').slice(-4);
  const trnUid = `stmt_${dtStart}_${dtEnd}_${lastFour}`;
  
  // Sort transactions by date for deterministic output
  const sortedTransactions = [...account.transactions].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.transactionId.localeCompare(b.transactionId);
  });
  
  const transactionsOfx = sortedTransactions
    .map((txn) => generateTransactionOfx(txn, txn.statementId))
    .join('\n');
  
  const availBalSection = includeAvailBal ? `
<AVAILBAL>
<BALAMT>${account.summary.endingBalance.toFixed(2)}</BALAMT>
<DTASOF>${dtEnd}</DTASOF>
</AVAILBAL>` : '';
  
  return `<STMTTRNRS>
<TRNUID>${trnUid}</TRNUID>
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
</LEDGERBAL>${availBalSection}
</STMTRS>
</STMTTRNRS>`;
}

/**
 * Generate OFX for an account block - dispatches to split or single mode
 */
function generateAccountOfx(
  account: FinalResultV2['accounts'][number],
  bankId: string,
  splitByStatement: boolean,
  includeAvailBal: boolean
): string {
  if (splitByStatement) {
    const periods = groupTransactionsByStatement(account);
    return periods
      .map((period) => generateStatementOfx(account, period, bankId, includeAvailBal))
      .join('\n');
  } else {
    return generateAccountOfxSingle(account, bankId, includeAvailBal);
  }
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
    splitByStatement = true,
    includeAvailBal = true,
  } = options;
  
  const parts: string[] = [];
  
  if (includeHeader) {
    parts.push(generateOfxHeader());
  }
  
  // Generate OFX for each account
  for (const account of v2Result.accounts) {
    parts.push(generateAccountOfx(account, bankId, splitByStatement, includeAvailBal));
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
    splitByStatement = true,
    includeAvailBal = true,
  } = options;
  
  const parts: string[] = [];
  
  if (includeHeader) {
    parts.push(generateOfxHeader());
  }
  
  parts.push(generateAccountOfx(accountBlock, bankId, splitByStatement, includeAvailBal));
  
  if (includeHeader) {
    parts.push(generateOfxFooter());
  }
  
  return parts.join('\n');
}

/**
 * Result of split-by-account export
 */
export interface SplitOfxResult {
  /** Account type (e.g., 'checking', 'savings') */
  accountType: string;
  /** Last 4 digits of account number */
  accountLast4: string;
  /** Suggested filename (e.g., 'boa_checking_3529.ofx') */
  filename: string;
  /** OFX content for this account */
  content: string;
}

/**
 * Export v2 rollup to separate OFX files per account.
 * 
 * @param v2Result - The v2 rollup result to export
 * @param options - Export options
 * @returns Array of split results, one per account
 */
export function exportOfxByAccount(
  v2Result: FinalResultV2,
  options: OfxExportOptions = {}
): SplitOfxResult[] {
  const results: SplitOfxResult[] = [];
  
  for (const account of v2Result.accounts) {
    const accountType = account.account.accountType.toLowerCase();
    const last4 = account.account.accountNumberMasked.replace(/\*/g, '').slice(-4);
    const filename = `boa_${accountType}_${last4}.ofx`;
    const content = exportAccountOfx(account, options);
    
    results.push({
      accountType,
      accountLast4: last4,
      filename,
      content,
    });
  }
  
  return results;
}
