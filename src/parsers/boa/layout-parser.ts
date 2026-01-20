/**
 * Layout-aware BOA statement parser using pdfjs-dist.
 * Uses positional text extraction for reliable row/column reconstruction.
 */
import { extractTextItems } from '../../extractors/layout-pdfjs.js';
import { groupByRows, mergeWrappedDescriptions, type Row } from '../../layout/index.js';
import { parseUSDate } from '../../utils/date.js';
import { parseAmount } from '../../utils/money.js';
import type { RawTransaction, AccountInfo, BalanceInfo } from './types.js';

/**
 * Configuration for layout-aware parsing.
 */
export interface LayoutParserConfig {
  /** Y-coordinate tolerance for row grouping (default: 3.0) */
  yTolerance?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Result of layout-aware parsing.
 */
export interface LayoutParseResult {
  accountInfo: AccountInfo;
  balanceInfo: BalanceInfo;
  transactions: RawTransaction[];
  warnings: string[];
  /** Debug info about extraction */
  debug?: {
    totalItems: number;
    totalRows: number;
    sectionsFound: string[];
  };
}

/**
 * Section markers for BOA statements.
 */
const SECTION_MARKERS = {
  accountSummary: /account\s+summary/i,
  depositsSection: /deposits\s+and\s+(?:other\s+)?additions/i,
  withdrawalsSection: /withdrawals\s+and\s+(?:other\s+)?subtractions|ATM\s+and\s+debit\s+card\s+subtractions/i,
  otherSubtractions: /other\s+subtractions/i,
  checksSection: /checks\s*$/i,
  serviceFees: /service\s+fees/i,
  dailyBalance: /daily\s+(?:ending\s+)?balance/i,
};

/**
 * Parse a BOA checking statement using layout-aware extraction.
 * 
 * @param filePath - Path to the PDF file
 * @param config - Parser configuration
 * @returns Parsed statement data
 */
export async function parseWithLayout(
  filePath: string,
  config: LayoutParserConfig = {}
): Promise<LayoutParseResult> {
  const { yTolerance = 3.0, debug = false } = config;
  const warnings: string[] = [];
  
  // Extract text items with positions
  const extracted = await extractTextItems(filePath);
  
  // Group into rows
  const rows = groupByRows(extracted.items, yTolerance);
  
  // Extract account info from rows
  const accountInfo = extractAccountInfoFromRows(rows, warnings);
  
  // Extract balance info from rows
  const balanceInfo = extractBalanceInfoFromRows(rows, warnings);
  
  // Extract transactions from rows
  const transactions = extractTransactionsFromRows(rows, accountInfo, warnings);
  
  const result: LayoutParseResult = {
    accountInfo,
    balanceInfo,
    transactions,
    warnings,
  };
  
  if (debug) {
    result.debug = {
      totalItems: extracted.items.length,
      totalRows: rows.length,
      sectionsFound: findSections(rows),
    };
  }
  
  return result;
}

/**
 * Extract account info from rows.
 */
function extractAccountInfoFromRows(rows: Row[], warnings: string[]): AccountInfo {
  let accountNumberMasked = '****0000';
  let statementPeriodStart = '';
  let statementPeriodEnd = '';
  
  // Look for account number pattern
  const accountPattern = /Account\s*#?\s*[\d\s]*(\d{4})/i;
  const periodPattern = /([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+to\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i;
  
  for (const row of rows) {
    // Check for account number
    const accountMatch = accountPattern.exec(row.text);
    if (accountMatch !== null && accountMatch[1] !== undefined && accountMatch[1].length > 0) {
      accountNumberMasked = `****${accountMatch[1]}`;
    }
    
    // Check for statement period
    const periodMatch = periodPattern.exec(row.text);
    if (periodMatch !== null && periodMatch[1] !== undefined && periodMatch[2] !== undefined && periodMatch[1].length > 0 && periodMatch[2].length > 0) {
      statementPeriodStart = parseMonthDayYear(periodMatch[1]);
      statementPeriodEnd = parseMonthDayYear(periodMatch[2]);
    }
  }
  
  if (accountNumberMasked === '****0000') {
    warnings.push('Could not extract account number from statement');
  }
  
  if (!statementPeriodStart || !statementPeriodEnd) {
    warnings.push('Could not extract statement period');
    const now = new Date();
    statementPeriodEnd = now.toISOString().split('T')[0] ?? '';
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    statementPeriodStart = lastMonth.toISOString().split('T')[0] ?? '';
  }
  
  return {
    accountType: 'checking',
    accountNumberMasked,
    statementPeriodStart,
    statementPeriodEnd,
  };
}

/**
 * Parse month day year format to ISO date.
 */
function parseMonthDayYear(dateStr: string): string {
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04',
    jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const match = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(dateStr);
  if (match !== null && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
    const monthNum = months[match[1].toLowerCase()];
    if (monthNum !== undefined) {
      return `${match[3]}-${monthNum}-${match[2].padStart(2, '0')}`;
    }
  }
  return '';
}

/**
 * Extract balance info from rows.
 */
function extractBalanceInfoFromRows(rows: Row[], warnings: string[]): BalanceInfo {
  let startingBalance = 0;
  let endingBalance = 0;
  let totalCredits = 0;
  let totalDebits = 0;
  
  const beginPattern = /(?:Beginning|Starting|Previous)\s+balance.*?\$?([0-9,]+\.\d{2})/i;
  const endPattern = /(?:Ending|Closing|New)\s+balance.*?\$?([0-9,]+\.\d{2})/i;
  const depositsPattern = /Total\s+deposits\s+and\s+other\s+additions.*?\$?([0-9,]+\.\d{2})/i;
  const atmPattern = /Total\s+ATM\s+and\s+debit\s+card\s+subtractions.*?\$?([0-9,]+\.\d{2})/i;
  const otherPattern = /Total\s+other\s+subtractions.*?\$?([0-9,]+\.\d{2})/i;
  const feesPattern = /Total\s+service\s+fees.*?\$?([0-9,]+\.\d{2})/i;
  
  for (const row of rows) {
    const text = row.text;
    
    const beginMatch = beginPattern.exec(text);
    if (beginMatch !== null && beginMatch[1] !== undefined && beginMatch[1].length > 0) {
      startingBalance = parseAmount(beginMatch[1]);
    }
    
    const endMatch = endPattern.exec(text);
    if (endMatch !== null && endMatch[1] !== undefined && endMatch[1].length > 0) {
      endingBalance = parseAmount(endMatch[1]);
    }
    
    const depositsMatch = depositsPattern.exec(text);
    if (depositsMatch !== null && depositsMatch[1] !== undefined && depositsMatch[1].length > 0) {
      totalCredits = parseAmount(depositsMatch[1]);
    }
    
    const atmMatch = atmPattern.exec(text);
    if (atmMatch !== null && atmMatch[1] !== undefined && atmMatch[1].length > 0) {
      totalDebits += parseAmount(atmMatch[1]);
    }
    
    const otherMatch = otherPattern.exec(text);
    if (otherMatch !== null && otherMatch[1] !== undefined && otherMatch[1].length > 0) {
      totalDebits += parseAmount(otherMatch[1]);
    }
    
    const feesMatch = feesPattern.exec(text);
    if (feesMatch !== null && feesMatch[1] !== undefined && feesMatch[1].length > 0) {
      totalDebits += parseAmount(feesMatch[1]);
    }
  }
  
  if (startingBalance === 0) {
    warnings.push('Could not extract beginning balance');
  }
  
  if (endingBalance === 0) {
    warnings.push('Could not extract ending balance');
  }
  
  return { startingBalance, endingBalance, totalCredits, totalDebits };
}

/**
 * Extract transactions from rows.
 */
function extractTransactionsFromRows(
  rows: Row[],
  accountInfo: AccountInfo,
  warnings: string[]
): RawTransaction[] {
  const transactions: RawTransaction[] = [];
  const statementYear = parseInt(accountInfo.statementPeriodEnd.split('-')[0] ?? '2024', 10);
  
  let currentSection: 'deposits' | 'withdrawals' | 'checks' | 'fees' | 'other' | 'unknown' = 'unknown';
  let inTransactionSection = false;
  
  // Merge wrapped descriptions
  const mergedRows = mergeWrappedDescriptions(rows);
  
  for (const row of mergedRows) {
    const text = row.text.trim();
    
    // Skip empty rows
    if (text.length === 0) continue;
    
    // Check for section markers
    if (SECTION_MARKERS.depositsSection.test(text)) {
      currentSection = 'deposits';
      inTransactionSection = true;
      continue;
    }
    if (SECTION_MARKERS.withdrawalsSection.test(text)) {
      currentSection = 'withdrawals';
      inTransactionSection = true;
      continue;
    }
    if (SECTION_MARKERS.otherSubtractions.test(text)) {
      currentSection = 'other';
      inTransactionSection = true;
      continue;
    }
    if (SECTION_MARKERS.checksSection.test(text)) {
      currentSection = 'checks';
      inTransactionSection = true;
      continue;
    }
    if (SECTION_MARKERS.serviceFees.test(text)) {
      currentSection = 'fees';
      inTransactionSection = true;
      continue;
    }
    if (SECTION_MARKERS.dailyBalance.test(text)) {
      inTransactionSection = false;
      currentSection = 'unknown';
      continue;
    }
    
    // Skip total lines
    if (/^Total\s+/i.test(text)) {
      continue;
    }
    
    // Skip if not in a transaction section
    if (!inTransactionSection) continue;
    
    // Try to parse as transaction
    const txn = parseTransactionFromRow(row, statementYear, currentSection);
    if (txn) {
      transactions.push(txn);
    }
  }
  
  if (transactions.length === 0) {
    warnings.push('No transactions found in statement');
  }
  
  return transactions;
}

/**
 * Parse a transaction from a row.
 */
function parseTransactionFromRow(
  row: Row,
  statementYear: number,
  section: 'deposits' | 'withdrawals' | 'checks' | 'fees' | 'other' | 'unknown'
): RawTransaction | null {
  const text = row.text.trim();
  
  // Check for check number pattern (date followed immediately by check number)
  const checkPattern = /^(\d{2}\/\d{2}\/\d{2})(\d{1,6})(-?[0-9,]+\.\d{2})$/;
  const checkMatch = checkPattern.exec(text);
  if (checkMatch !== null && checkMatch[1] !== undefined && checkMatch[2] !== undefined && checkMatch[3] !== undefined) {
    let amount = checkMatch[3];
    if (!amount.startsWith('-')) {
      amount = `-${amount}`;
    }
    return {
      date: parseUSDate(checkMatch[1], statementYear),
      description: `Check #${checkMatch[2]}`,
      amount,
      page: row.page,
      lineIndex: 0,
      originalLine: text,
      section,
    };
  }
  
  // Standard transaction pattern: date description amount
  const txnPattern = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s*(.+?)\s*(-?[0-9,]+\.\d{2})$/;
  const txnMatch = txnPattern.exec(text);
  if (txnMatch !== null && txnMatch[1] !== undefined && txnMatch[2] !== undefined && txnMatch[3] !== undefined) {
    let amount = txnMatch[3];
    
    // Make withdrawals/fees negative
    if (section === 'withdrawals' || section === 'checks' || section === 'fees' || section === 'other') {
      if (!amount.startsWith('-')) {
        amount = `-${amount}`;
      }
    }
    
    return {
      date: parseUSDate(txnMatch[1], statementYear),
      description: txnMatch[2].trim(),
      amount,
      page: row.page,
      lineIndex: 0,
      originalLine: text,
      section,
    };
  }
  
  return null;
}

/**
 * Find which sections are present in the rows.
 */
function findSections(rows: Row[]): string[] {
  const sections: string[] = [];
  
  for (const row of rows) {
    const text = row.text;
    
    if (SECTION_MARKERS.accountSummary.test(text)) sections.push('accountSummary');
    if (SECTION_MARKERS.depositsSection.test(text)) sections.push('deposits');
    if (SECTION_MARKERS.withdrawalsSection.test(text)) sections.push('withdrawals');
    if (SECTION_MARKERS.otherSubtractions.test(text)) sections.push('otherSubtractions');
    if (SECTION_MARKERS.checksSection.test(text)) sections.push('checks');
    if (SECTION_MARKERS.serviceFees.test(text)) sections.push('serviceFees');
    if (SECTION_MARKERS.dailyBalance.test(text)) sections.push('dailyBalance');
  }
  
  return [...new Set(sections)];
}
