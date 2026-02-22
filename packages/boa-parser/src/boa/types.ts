import type { ZodAccountType as AccountType } from '@findata/types';

export type TransactionSection = 'deposits' | 'withdrawals' | 'checks' | 'fees' | 'other' | 'unknown';

export interface RawTransaction {
  date: string;
  description: string;
  amount: string;
  page: number;
  lineIndex: number;
  originalLine: string;
  section?: TransactionSection;
}

export interface AccountInfo {
  accountType: AccountType;
  accountNumberMasked: string;
  statementPeriodStart: string;
  statementPeriodEnd: string;
}

export interface BalanceInfo {
  startingBalance: number;
  endingBalance: number;
  totalCredits: number;
  totalDebits: number;
}

export interface ParseContext {
  statementYear: number;
  accountType: AccountType;
  warnings: string[];
}
