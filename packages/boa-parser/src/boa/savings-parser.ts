import type { ExtractedPDF, ExtractedPage } from '@findata/pdf-extract';
import { parseUSDate } from '@findata/types';
import { parseAmount } from '@findata/types';
import type { RawTransaction, AccountInfo, BalanceInfo } from './types.js';

/**
 * Pre-process a line to fix common OCR/extraction issues:
 * - Separates date from merchant when no space exists (e.g., "03/17/257-ELEVEN" -> "03/17/25 7-ELEVEN")
 */
function preprocessLine(line: string): string {
  return line.replace(
    /^(\d{2}\/\d{2}\/\d{2})([A-Za-z0-9])/,
    '$1 $2'
  );
}

const SAVINGS_PATTERNS = {
  accountNumber: /Account\s*#?\s*[\d\s]*(\d{4})/im,
  accountNumberAlt: /(?:Account|Acct).*?(\d{4})$/im,
  statementPeriod: /([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+to\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  statementPeriodAlt: /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:to|-|through)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  beginningBalance: /(?:Beginning|Starting|Previous)\s+balance\s*(?:on\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4})?\s*[:\s$]*\$?([0-9,]+\.\d{2})/i,
  endingBalance: /(?:Ending|Closing|New)\s+balance\s*(?:on\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4})?\s*[:\s$]*\$?([0-9,]+\.\d{2})/i,
  totalDeposits: /Total\s+deposits\s+and\s+other\s+additions\s*-?\$?([0-9,]+\.\d{2})/i,
  totalWithdrawals: /Total\s+ATM\s+and\s+debit\s+card\s+subtractions\s*-?\$?([0-9,]+\.\d{2})/i,
  totalOtherSubtractions: /Total\s+other\s+subtractions\s*-?\$?([0-9,]+\.\d{2})/i,
  totalServiceFees: /Total\s+service\s+fees\s*-?\$?([0-9,]+\.\d{2})/i,
  transactionLine: /^(\d{1,2}\/\d{1,2})\s+(.+?)\s+(-?[0-9,]+\.\d{2})$/,
  transactionLineAlt: /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+(-?[0-9,]+\.\d{2})$/,
  transactionLineBoA: /^(\d{2}\/\d{2}\/\d{2})(.+?)(-?[0-9,]+\.\d{2})$/,
  depositsSection: /deposits\s+and\s+(?:other\s+)?additions/i,
  withdrawalsSection: /withdrawals\s+and\s+(?:other\s+)?subtractions|ATM\s+and\s+debit\s+card\s+subtractions|other\s+subtractions/i,
  serviceFees: /service\s+fees/i,
  dailyBalanceSection: /daily\s+(?:ending\s+)?balance/i,
  totalLine: /^Total\s+/i,
  interestEarned: /interest\s+earned/i,
  apyEarned: /annual\s+percentage\s+yield\s+earned/i,
};

export interface StatementSegment {
  text: string;
  pages: ExtractedPage[];
  startPage: number;
  endPage: number;
}

/**
 * Detect statement boundaries in a multi-statement PDF.
 * Returns an array of text segments, one per statement.
 */
function detectStatementBoundaries(pdf: ExtractedPDF): StatementSegment[] {
  const segments: StatementSegment[] = [];
  
  const boundaryPattern = /Beginning\s+balance\s+on\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi;
  
  const boundaries: Array<{ date: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = boundaryPattern.exec(pdf.fullText)) !== null) {
    boundaries.push({ date: match[1] ?? '', index: match.index });
  }
  
  if (boundaries.length === 0) {
    return [{
      text: pdf.fullText,
      pages: pdf.pages,
      startPage: 1,
      endPage: pdf.pages.length,
    }];
  }
  
  for (let i = 0; i < boundaries.length; i++) {
    const boundaryPos = boundaries[i]?.index ?? 0;
    let startPos = boundaryPos;
    
    const searchStart = Math.max(0, boundaryPos - 500);
    const searchText = pdf.fullText.slice(searchStart, boundaryPos);
    const periodMatch = /(?:for\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+to\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi.exec(searchText);
    if (periodMatch !== null) {
      startPos = searchStart + periodMatch.index;
    }
    
    const endPos = boundaries[i + 1]?.index ?? pdf.fullText.length;
    let adjustedEndPos = endPos;
    if (i + 1 < boundaries.length) {
      const nextSearchStart = Math.max(0, endPos - 500);
      const nextSearchText = pdf.fullText.slice(nextSearchStart, endPos);
      const nextPeriodMatch = /(?:for\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+to\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi.exec(nextSearchText);
      if (nextPeriodMatch !== null) {
        adjustedEndPos = nextSearchStart + nextPeriodMatch.index;
      }
    }
    
    const segmentText = pdf.fullText.slice(startPos, adjustedEndPos);
    
    const segmentPages: ExtractedPage[] = [];
    let startPage = 1;
    let endPage = pdf.pages.length;
    
    for (const page of pdf.pages) {
      const pageStartInFull = pdf.fullText.indexOf(page.text);
      const pageEndInFull = pageStartInFull + page.text.length;
      
      if (pageEndInFull > startPos && pageStartInFull < adjustedEndPos) {
        segmentPages.push(page);
        if (segmentPages.length === 1) {
          startPage = page.pageNumber;
        }
        endPage = page.pageNumber;
      }
    }
    
    segments.push({
      text: segmentText,
      pages: segmentPages.length > 0 ? segmentPages : pdf.pages,
      startPage,
      endPage,
    });
  }
  
  return segments;
}

/**
 * Parse multiple savings statements from a combined PDF.
 */
export function parseMultipleSavingsStatements(pdf: ExtractedPDF): Array<{
  accountInfo: AccountInfo;
  balanceInfo: BalanceInfo;
  transactions: RawTransaction[];
  warnings: string[];
  pageRange: { start: number; end: number };
}> {
  const segments = detectStatementBoundaries(pdf);
  const results: Array<{
    accountInfo: AccountInfo;
    balanceInfo: BalanceInfo;
    transactions: RawTransaction[];
    warnings: string[];
    pageRange: { start: number; end: number };
  }> = [];
  
  for (const segment of segments) {
    const warnings: string[] = [];
    const accountInfo = extractAccountInfo(segment.text, warnings);
    const balanceInfo = extractBalanceInfo(segment.text, warnings);
    
    const allTransactions = extractTransactions(segment.pages, accountInfo, warnings);
    const filteredTransactions = filterTransactionsByPeriod(
      allTransactions,
      accountInfo.statementPeriodStart,
      accountInfo.statementPeriodEnd
    );
    
    results.push({
      accountInfo,
      balanceInfo,
      transactions: filteredTransactions,
      warnings,
      pageRange: { start: segment.startPage, end: segment.endPage },
    });
  }
  
  return results;
}

/**
 * Filter transactions to only those within the statement period.
 */
function filterTransactionsByPeriod(
  transactions: RawTransaction[],
  startDate: string,
  endDate: string
): RawTransaction[] {
  if (!startDate || !endDate) {
    return transactions;
  }
  
  return transactions.filter(txn => {
    return txn.date >= startDate && txn.date <= endDate;
  });
}

/**
 * Parse a single savings statement.
 */
export function parseSavingsStatement(pdf: ExtractedPDF): {
  accountInfo: AccountInfo;
  balanceInfo: BalanceInfo;
  transactions: RawTransaction[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const fullText = pdf.fullText;

  const accountInfo = extractAccountInfo(fullText, warnings);
  const balanceInfo = extractBalanceInfo(fullText, warnings);
  const transactions = extractTransactions(pdf.pages, accountInfo, warnings);

  return { accountInfo, balanceInfo, transactions, warnings };
}

function extractAccountInfo(text: string, warnings: string[]): AccountInfo {
  let accountNumberMasked = '****0000';
  let statementPeriodStart = '';
  let statementPeriodEnd = '';

  const accountMatch = SAVINGS_PATTERNS.accountNumber.exec(text) ?? 
                       SAVINGS_PATTERNS.accountNumberAlt.exec(text);
  if (accountMatch?.[1] !== undefined) {
    accountNumberMasked = `****${accountMatch[1]}`;
  } else {
    warnings.push('Could not extract account number from savings statement');
  }

  const periodMatch = SAVINGS_PATTERNS.statementPeriod.exec(text);
  if (periodMatch?.[1] !== undefined && periodMatch[2] !== undefined) {
    statementPeriodStart = parseMonthDayYear(periodMatch[1]);
    statementPeriodEnd = parseMonthDayYear(periodMatch[2]);
  } else {
    const periodAltMatch = SAVINGS_PATTERNS.statementPeriodAlt.exec(text);
    if (periodAltMatch?.[1] !== undefined && periodAltMatch[2] !== undefined) {
      statementPeriodStart = parseUSDate(periodAltMatch[1]);
      statementPeriodEnd = parseUSDate(periodAltMatch[2]);
    } else {
      warnings.push('Could not extract statement period from savings statement');
      const now = new Date();
      statementPeriodEnd = now.toISOString().split('T')[0] ?? '';
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      statementPeriodStart = lastMonth.toISOString().split('T')[0] ?? '';
    }
  }

  return {
    accountType: 'savings',
    accountNumberMasked,
    statementPeriodStart,
    statementPeriodEnd,
  };
}

function parseMonthDayYear(dateStr: string): string {
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04',
    jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const match = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(dateStr);
  if (match?.[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
    const monthNum = months[match[1].toLowerCase()];
    if (monthNum !== undefined) {
      return `${match[3]}-${monthNum}-${match[2].padStart(2, '0')}`;
    }
  }
  throw new Error(`Unable to parse date: ${dateStr}`);
}

function extractBalanceInfo(text: string, warnings: string[]): BalanceInfo {
  let startingBalance = 0;
  let endingBalance = 0;
  let totalCredits = 0;
  let totalDebits = 0;

  const beginMatch = SAVINGS_PATTERNS.beginningBalance.exec(text);
  if (beginMatch?.[1] !== undefined) {
    startingBalance = parseAmount(beginMatch[1]);
  } else {
    warnings.push('Could not extract beginning balance from savings statement');
  }

  const endMatch = SAVINGS_PATTERNS.endingBalance.exec(text);
  if (endMatch?.[1] !== undefined) {
    endingBalance = parseAmount(endMatch[1]);
  } else {
    warnings.push('Could not extract ending balance from savings statement');
  }

  const depositsMatch = SAVINGS_PATTERNS.totalDeposits.exec(text);
  if (depositsMatch?.[1] !== undefined) {
    totalCredits = parseAmount(depositsMatch[1]);
  }

  const withdrawalsMatch = SAVINGS_PATTERNS.totalWithdrawals.exec(text);
  if (withdrawalsMatch?.[1] !== undefined) {
    totalDebits += parseAmount(withdrawalsMatch[1]);
  }

  const otherSubtractionsMatch = SAVINGS_PATTERNS.totalOtherSubtractions.exec(text);
  if (otherSubtractionsMatch?.[1] !== undefined) {
    totalDebits += parseAmount(otherSubtractionsMatch[1]);
  }

  const serviceFeesMatch = SAVINGS_PATTERNS.totalServiceFees.exec(text);
  if (serviceFeesMatch?.[1] !== undefined) {
    totalDebits += parseAmount(serviceFeesMatch[1]);
  }

  return { startingBalance, endingBalance, totalCredits, totalDebits };
}

function extractTransactions(
  pages: ExtractedPage[],
  accountInfo: AccountInfo,
  warnings: string[]
): RawTransaction[] {
  const transactions: RawTransaction[] = [];
  const statementYear = parseInt(accountInfo.statementPeriodEnd.split('-')[0] ?? '2024', 10);

  let currentSection: 'deposits' | 'withdrawals' | 'fees' | 'unknown' = 'unknown';
  let pendingLine: { line: string; page: number; index: number } | null = null;

  for (const page of pages) {
    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i];
      if (line === undefined) continue;

      if (SAVINGS_PATTERNS.totalLine.test(line)) {
        pendingLine = null;
        continue;
      }

      if (SAVINGS_PATTERNS.depositsSection.test(line)) {
        currentSection = 'deposits';
        pendingLine = null;
        continue;
      }
      if (SAVINGS_PATTERNS.withdrawalsSection.test(line)) {
        currentSection = 'withdrawals';
        pendingLine = null;
        continue;
      }
      if (SAVINGS_PATTERNS.serviceFees.test(line)) {
        currentSection = 'fees';
        pendingLine = null;
        continue;
      }
      if (SAVINGS_PATTERNS.dailyBalanceSection.test(line)) {
        currentSection = 'unknown';
        pendingLine = null;
        continue;
      }

      // Check if this line is just an amount (continuation of previous line)
      const amountOnlyMatch = /^-?[0-9,]+\.\d{2}$/.exec(line.trim());
      if (amountOnlyMatch !== null && pendingLine !== null) {
        const mergedLine = `${pendingLine.line}${line.trim()}`;
        const processedLine = preprocessLine(mergedLine);
        const txn = parseTransactionLine(processedLine, pendingLine.page, pendingLine.index, statementYear, currentSection);
        if (txn !== null) {
          transactions.push(txn);
        }
        pendingLine = null;
        continue;
      }

      const processedLine = preprocessLine(line);
      
      const dateOnlyMatch = /^(\d{2}\/\d{2}\/\d{2})(.+)$/.exec(processedLine);
      const hasAmount = /-?[0-9,]+\.\d{2}$/.test(processedLine);
      
      if (dateOnlyMatch !== null && !hasAmount) {
        pendingLine = { line: processedLine, page: page.pageNumber, index: i };
        continue;
      }
      
      const txn = parseTransactionLine(processedLine, page.pageNumber, i, statementYear, currentSection);
      if (txn !== null) {
        transactions.push(txn);
        pendingLine = null;
      }
    }
  }

  if (transactions.length === 0) {
    warnings.push('No transactions found in savings statement');
  }

  return transactions;
}

function extractAmountFromConfirmationLine(line: string): { cleanedLine: string; amount: string } | null {
  const confPattern = /Confirmation#\s*(\d{10})(\d*,?\d*\.\d{2})$/i;
  const match = confPattern.exec(line);
  if (match !== null && match[1] !== undefined && match[2] !== undefined) {
    const confirmationNum = match[1];
    const amount = match[2];
    const cleanedLine = line.replace(confPattern, `Confirmation# ${confirmationNum} ${amount}`);
    return { cleanedLine, amount };
  }
  return null;
}

/**
 * Extract amount from lines where a long trace number is concatenated with the amount.
 * BoA CHECKCARD transactions have 17-25 digit trace numbers that can run into the amount.
 * Example: "CA 749064152172355304579864.32" -> trace is "74906415217235530457986", amount is "4.32"
 */
function extractAmountFromTraceNumberLine(line: string): { cleanedLine: string; amount: string } | null {
  // Pattern: State code followed by space, then long number (17-25 digits) concatenated with amount
  // The trace number is 17-25 digits, amount is typically 1-6 digits before decimal
  const tracePattern = /([A-Z]{2})\s+(\d{17,25})(\d{1,6}\.\d{2})$/;
  const match = tracePattern.exec(line);
  if (match !== null && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
    const stateCode = match[1];
    const traceNum = match[2];
    const amount = match[3];
    // Validate: amount should be reasonable (less than 100000)
    const amountNum = parseFloat(amount);
    if (amountNum < 100000) {
      const cleanedLine = line.replace(tracePattern, `${stateCode} ${traceNum} ${amount}`);
      return { cleanedLine, amount };
    }
  }
  return null;
}

function parseTransactionLine(
  line: string,
  pageNumber: number,
  lineIndex: number,
  statementYear: number,
  section: 'deposits' | 'withdrawals' | 'fees' | 'unknown'
): RawTransaction | null {
  // Check for confirmation number mixed with amount
  const confExtraction = extractAmountFromConfirmationLine(line);
  let workingLine = line;
  let extractedAmount: string | null = null;
  if (confExtraction !== null) {
    workingLine = confExtraction.cleanedLine;
    extractedAmount = confExtraction.amount;
  }

  // Check for trace number mixed with amount (long digit sequences before amount)
  if (extractedAmount === null) {
    const traceExtraction = extractAmountFromTraceNumberLine(workingLine);
    if (traceExtraction !== null) {
      workingLine = traceExtraction.cleanedLine;
      extractedAmount = traceExtraction.amount;
    }
  }

  const match = SAVINGS_PATTERNS.transactionLine.exec(workingLine) ??
                SAVINGS_PATTERNS.transactionLineAlt.exec(workingLine) ??
                SAVINGS_PATTERNS.transactionLineBoA.exec(workingLine);

  if (match === null) return null;

  const [, dateStr, description, amountStr] = match;
  if (dateStr === undefined || description === undefined || amountStr === undefined) {
    return null;
  }

  let amount = extractedAmount ?? amountStr;
  if (section === 'withdrawals' || section === 'fees') {
    if (!amount.startsWith('-')) {
      amount = `-${amount}`;
    }
  }

  return {
    date: parseUSDate(dateStr, statementYear),
    description: description.trim(),
    amount,
    page: pageNumber,
    lineIndex,
    originalLine: line,
    section,
  };
}
