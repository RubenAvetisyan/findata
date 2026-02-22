import type { ExtractedPDF, ExtractedPage } from '@findata/pdf-extract';
import { parseUSDate } from '@findata/types';
import { parseAmount } from '@findata/types';
import type { RawTransaction, AccountInfo, BalanceInfo } from './types.js';

const CREDIT_PATTERNS = {
  accountNumber: /Account\s*(?:number|#|:)?\s*[-\s]*(?:ending\s+in\s+)?(\d{4})/im,
  accountNumberAlt: /Card\s*(?:number|#|:)?.*?(\d{4})/im,
  statementPeriod: /(?:Statement\s+(?:closing\s+)?date|Closing\s+date)\s*[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  statementPeriodRange: /(?:Statement\s+period|Billing\s+period)\s*[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*(?:to|-|through)\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  previousBalance: /(?:Previous|Prior|Last)\s+(?:statement\s+)?balance\s*[:\s$]*(-?[0-9,]+\.\d{2})/i,
  newBalance: /(?:New|Current|Statement)\s+balance\s*[:\s$]*(-?[0-9,]+\.\d{2})/i,
  totalPayments: /(?:Payments|Credits)(?:\s+and\s+(?:other\s+)?credits)?\s*[:\s$]*(-?[0-9,]+\.\d{2})/i,
  totalPurchases: /(?:Purchases|Charges)(?:\s+and\s+adjustments)?\s*[:\s$]*(-?[0-9,]+\.\d{2})/i,
  transactionLine: /^(\d{1,2}\/\d{1,2})\s+(\d{1,2}\/\d{1,2})?\s*(.+?)\s+(-?[0-9,]+\.\d{2})$/,
  transactionLineAlt: /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+(-?[0-9,]+\.\d{2})$/,
  paymentsSection: /payments\s+and\s+(?:other\s+)?credits/i,
  purchasesSection: /purchases\s+and\s+adjustments|transactions/i,
  feesSection: /fees\s+charged/i,
  interestSection: /interest\s+charged/i,
  accountSummary: /account\s+summary/i,
};

export function parseCreditStatement(pdf: ExtractedPDF): {
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

  const accountMatch = CREDIT_PATTERNS.accountNumber.exec(text) ??
                       CREDIT_PATTERNS.accountNumberAlt.exec(text);
  if (accountMatch?.[1] !== undefined) {
    accountNumberMasked = `****${accountMatch[1]}`;
  } else {
    warnings.push('Could not extract account number from credit card statement');
  }

  const periodRangeMatch = CREDIT_PATTERNS.statementPeriodRange.exec(text);
  if (periodRangeMatch?.[1] !== undefined && periodRangeMatch[2] !== undefined) {
    statementPeriodStart = parseMonthDayYear(periodRangeMatch[1]);
    statementPeriodEnd = parseMonthDayYear(periodRangeMatch[2]);
  } else {
    const periodMatch = CREDIT_PATTERNS.statementPeriod.exec(text);
    if (periodMatch?.[1] !== undefined) {
      statementPeriodEnd = parseMonthDayYear(periodMatch[1]);
      const endDate = new Date(statementPeriodEnd);
      const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, endDate.getDate() + 1);
      statementPeriodStart = startDate.toISOString().split('T')[0] ?? '';
    } else {
      warnings.push('Could not extract statement period from credit card statement');
      const now = new Date();
      statementPeriodEnd = now.toISOString().split('T')[0] ?? '';
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      statementPeriodStart = lastMonth.toISOString().split('T')[0] ?? '';
    }
  }

  return {
    accountType: 'credit',
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

  const prevMatch = CREDIT_PATTERNS.previousBalance.exec(text);
  if (prevMatch?.[1] !== undefined) {
    startingBalance = parseAmount(prevMatch[1]);
  } else {
    warnings.push('Could not extract previous balance from credit card statement');
  }

  const newMatch = CREDIT_PATTERNS.newBalance.exec(text);
  if (newMatch?.[1] !== undefined) {
    endingBalance = parseAmount(newMatch[1]);
  } else {
    warnings.push('Could not extract new balance from credit card statement');
  }

  const paymentsMatch = CREDIT_PATTERNS.totalPayments.exec(text);
  if (paymentsMatch?.[1] !== undefined) {
    totalCredits = Math.abs(parseAmount(paymentsMatch[1]));
  }

  const purchasesMatch = CREDIT_PATTERNS.totalPurchases.exec(text);
  if (purchasesMatch?.[1] !== undefined) {
    totalDebits = Math.abs(parseAmount(purchasesMatch[1]));
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

  let currentSection: 'payments' | 'purchases' | 'fees' | 'interest' | 'unknown' = 'unknown';

  for (const page of pages) {
    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i];
      if (line === undefined) continue;

      if (CREDIT_PATTERNS.paymentsSection.test(line)) {
        currentSection = 'payments';
        continue;
      }
      if (CREDIT_PATTERNS.purchasesSection.test(line)) {
        currentSection = 'purchases';
        continue;
      }
      if (CREDIT_PATTERNS.feesSection.test(line)) {
        currentSection = 'fees';
        continue;
      }
      if (CREDIT_PATTERNS.interestSection.test(line)) {
        currentSection = 'interest';
        continue;
      }
      if (CREDIT_PATTERNS.accountSummary.test(line)) {
        currentSection = 'unknown';
        continue;
      }

      const txn = parseTransactionLine(line, page.pageNumber, i, statementYear, currentSection);
      if (txn !== null) {
        transactions.push(txn);
      }
    }
  }

  if (transactions.length === 0) {
    warnings.push('No transactions found in credit card statement');
  }

  return transactions;
}

function parseTransactionLine(
  line: string,
  pageNumber: number,
  lineIndex: number,
  statementYear: number,
  section: 'payments' | 'purchases' | 'fees' | 'interest' | 'unknown'
): RawTransaction | null {
  let match = CREDIT_PATTERNS.transactionLine.exec(line);
  let transactionDate: string;
  let description: string;
  let amountStr: string;

  if (match !== null) {
    const [, txnDate, , desc, amt] = match;
    if (txnDate === undefined || desc === undefined || amt === undefined) {
      return null;
    }
    transactionDate = txnDate;
    description = desc;
    amountStr = amt;
  } else {
    match = CREDIT_PATTERNS.transactionLineAlt.exec(line);
    if (match === null) return null;

    const [, txnDate, desc, amt] = match;
    if (txnDate === undefined || desc === undefined || amt === undefined) {
      return null;
    }
    transactionDate = txnDate;
    description = desc;
    amountStr = amt;
  }

  let amount = amountStr;
  if (section === 'payments') {
    if (!amountStr.startsWith('-')) {
      amount = `-${amountStr}`;
    }
  }

  const parsedDate = parseUSDate(transactionDate, statementYear);

  return {
    date: parsedDate,
    description: description.trim(),
    amount,
    page: pageNumber,
    lineIndex,
    originalLine: line,
  };
}
