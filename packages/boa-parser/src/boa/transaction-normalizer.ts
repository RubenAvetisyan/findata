/**
 * Transaction normalizer - converts raw parsed lines into fully normalized Transaction objects.
 * Generates stable IDs, extracts all required fields, and applies categorization.
 */

import { createHash } from 'crypto';
import type { 
  Transaction, 
  ParsedLine, 
  ISODate, 
  Direction,
  SectionType,
} from '@findata/types';
import { extractChannelAndReference } from './channel-extractor.js';
import { extractMerchant } from './merchant-extractor.js';
import { categorizeTransaction } from '@findata/categorizer';
import { parseAmount } from '@findata/types';
import { parseUSDate } from '@findata/types';

export interface NormalizationContext {
  statementId: string;
  statementYear: number;
  isCreditCard: boolean;
}

export function normalizeTransaction(
  parsed: ParsedLine,
  context: NormalizationContext
): Transaction {
  const date = parseUSDate(parsed.date, context.statementYear) as ISODate;
  const rawAmount = parseAmount(parsed.amount);
  
  const section = parsed.section;
  const sectionForSchema = mapSectionToSchema(section);
  
  const { channel, bankReference } = extractChannelAndReference(
    parsed.description,
    section
  );
  
  const merchant = extractMerchant(parsed.description);
  
  const descriptionForCategorization = stripTraceNumber(parsed.description);
  const categorizationResult = categorizeTransaction(descriptionForCategorization, channel.type);
  
  const { amount, direction } = computeAmountAndDirection(
    rawAmount,
    section,
    context.isCreditCard
  );
  
  const cleanedDescription = cleanDescription(parsed.description);
  
  const transactionId = generateTransactionId(
    context.statementId,
    date,
    amount,
    cleanedDescription
  );
  
  const flags = computeFlags(channel.type, parsed.description);
  
  const transaction: Transaction = {
    transactionId,
    date,
    postedDate: null,
    amount,
    direction,
    description: cleanedDescription,
    descriptionRaw: parsed.originalText,
    merchant: {
      name: merchant.name,
      normalizedName: merchant.normalizedName,
      city: merchant.city,
      state: merchant.state,
      phone: merchant.phone,
      online: merchant.online,
      network: merchant.network,
    },
    bankReference: {
      cardTransactionTraceNumber: bankReference.cardTransactionTraceNumber,
      confirmationNumber: bankReference.confirmationNumber,
      zelleConfirmation: bankReference.zelleConfirmation,
      checkNumber: bankReference.checkNumber,
      atmId: bankReference.atmId,
      terminalOrStoreId: bankReference.terminalOrStoreId,
    },
    channel: {
      type: channel.type,
      subtype: channel.subtype,
    },
    categorization: {
      category: categorizationResult.category,
      subcategory: categorizationResult.subcategory,
      confidence: categorizationResult.confidence,
      ruleId: categorizationResult.ruleId,
      rationale: categorizationResult.rationale,
    },
    raw: {
      page: parsed.page,
      lineIndex: parsed.lineIndex,
      section: sectionForSchema,
      originalText: parsed.originalText,
    },
  };
  
  if (flags !== undefined) {
    transaction.flags = flags;
  }
  
  return transaction;
}

function mapSectionToSchema(section: SectionType): SectionType {
  if (section === null) return null;
  const mapping: Record<string, SectionType> = {
    'deposits': 'deposits',
    'atm_debit': 'atm_debit',
    'withdrawals': 'atm_debit',
    'other_subtractions': 'other_subtractions',
    'checks': 'checks',
    'service_fees': 'service_fees',
    'fees': 'service_fees',
  };
  return mapping[section] ?? null;
}

function computeAmountAndDirection(
  rawAmount: number,
  section: SectionType,
  isCreditCard: boolean
): { amount: number; direction: Direction } {
  const absAmount = Math.abs(rawAmount);
  
  if (isCreditCard) {
    const direction: Direction = rawAmount >= 0 ? 'debit' : 'credit';
    return {
      amount: direction === 'debit' ? -absAmount : absAmount,
      direction,
    };
  }
  
  const isDebitSection = section === 'atm_debit' || 
                         section === 'other_subtractions' || 
                         section === 'checks' || 
                         section === 'service_fees';
  
  if (isDebitSection) {
    return { amount: -absAmount, direction: 'debit' };
  }
  
  if (section === 'deposits') {
    return { amount: absAmount, direction: 'credit' };
  }
  
  const direction: Direction = rawAmount >= 0 ? 'credit' : 'debit';
  return {
    amount: direction === 'debit' ? -absAmount : absAmount,
    direction,
  };
}

function stripTraceNumber(description: string): string {
  return description.replace(/\s+\d{17,25}$/, '').trim();
}

function cleanDescription(description: string): string {
  return description
    .replace(/\s+\d{17,25}$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function generateTransactionId(
  statementId: string,
  date: string,
  amount: number,
  description: string
): string {
  const input = `${statementId}|${date}|${amount}|${description}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

function computeFlags(channelType: string, description: string): Transaction['flags'] {
  const flags: Transaction['flags'] = {};
  
  if (channelType === 'ZELLE' || channelType === 'ONLINE_BANKING_TRANSFER') {
    flags.isTransfer = true;
  }
  
  if (channelType === 'ATM_WITHDRAWAL') {
    flags.isCashWithdrawal = true;
  }
  
  if (channelType === 'ATM_DEPOSIT' || channelType === 'FINANCIAL_CENTER_DEPOSIT') {
    flags.isCashDeposit = true;
  }
  
  const subscriptionPatterns = [
    /netflix/i, /spotify/i, /hulu/i, /disney/i, /hbo/i,
    /apple\s*(music|tv|one)/i, /youtube\s*premium/i,
    /amazon\s*prime/i, /audible/i,
  ];
  
  if (subscriptionPatterns.some((p) => p.test(description))) {
    flags.isSubscription = true;
    flags.isRecurring = true;
  }
  
  return Object.keys(flags).length > 0 ? flags : undefined;
}

export function normalizeTransactions(
  parsedLines: ParsedLine[],
  context: NormalizationContext
): Transaction[] {
  return parsedLines.map((line) => normalizeTransaction(line, context));
}
