/**
 * Channel and Bank Reference extraction from transaction descriptions.
 * Detects transaction type (CHECKCARD, ATM, ZELLE, etc.) and extracts
 * reference numbers without using them for categorization.
 */

import type { ChannelType, ChannelInfo, BankReferenceInfo } from '../../types/output.js';

const CHANNEL_PATTERNS = {
  CHECKCARD: /^CHECKCARD\s+(\d{4})\s+(.+?)(?:\s+(\d{20,}))?$/i,
  CHECKCARD_ALT: /CHECKCARD\s+\d{4}/i,
  
  ONLINE_BANKING_TRANSFER_FROM_SAV: /Online Banking transfer from SAV.*?Confirmation#\s*(\d+)/i,
  ONLINE_BANKING_TRANSFER_TO_SAV: /Online Banking transfer to SAV.*?Confirmation#\s*(\d+)/i,
  ONLINE_BANKING_TRANSFER: /Online Banking transfer.*?Confirmation#\s*(\d+)/i,
  ONLINE_BANKING_PAYMENT: /Online Banking payment.*?Confirmation#\s*(\d+)/i,
  
  ATM_DEPOSIT: /BKOFAMERICA\s+ATM\s+#?(\d+)\s+.*?DEPOSIT/i,
  ATM_WITHDRAWAL: /(?:ATM|BKOFAMERICA\s+ATM)\s+#?(\d+)?.*?(?:WITHDRWL|WITHDRAWAL)/i,
  ATM_GENERIC: /BKOFAMERICA\s+ATM\s+#?(\d+)/i,
  
  ZELLE_PAYMENT: /Zelle\s+(?:payment|transfer)\s+(?:from|to)\s+(.+?)\s+Conf#\s*(\w+)/i,
  ZELLE_GENERIC: /Zelle/i,
  
  FINANCIAL_CENTER_DEPOSIT: /(?:FINANCIAL CENTER|BRANCH)\s+DEPOSIT/i,
  
  CHECK: /^(?:Check\s*#?\s*)?(\d{1,6})$/i,
  CHECK_PAID: /CHECK\s*#?\s*(\d+)/i,
  
  FEE: /(?:SERVICE\s+FEE|MONTHLY\s+MAINTENANCE|OVERDRAFT|NSF\s+FEE|RETURNED\s+ITEM)/i,
  
  PURCHASE: /^(?:PURCHASE|POS)\s+/i,
};

const TRACE_NUMBER_PATTERN = /(\d{17,25})$/;
const CONFIRMATION_PATTERN = /Confirmation#?\s*(\d+)/i;
const ZELLE_CONF_PATTERN = /Conf#\s*(\w+)/i;
const ATM_ID_PATTERN = /ATM\s+#?(\d{6,12})/i;
const CHECK_NUMBER_PATTERN = /(?:Check\s*#?\s*|^)(\d{1,6})(?:\s|$)/i;

export function extractChannel(description: string, section?: string | null): ChannelInfo {
  const desc = description.trim();
  
  if (CHANNEL_PATTERNS.ONLINE_BANKING_TRANSFER_FROM_SAV.test(desc)) {
    return { type: 'ONLINE_BANKING_TRANSFER', subtype: 'transfer_from_sav' };
  }
  
  if (CHANNEL_PATTERNS.ONLINE_BANKING_TRANSFER_TO_SAV.test(desc)) {
    return { type: 'ONLINE_BANKING_TRANSFER', subtype: 'transfer_to_sav' };
  }
  
  if (CHANNEL_PATTERNS.ONLINE_BANKING_TRANSFER.test(desc) || CHANNEL_PATTERNS.ONLINE_BANKING_PAYMENT.test(desc)) {
    return { type: 'ONLINE_BANKING_TRANSFER', subtype: null };
  }
  
  if (CHANNEL_PATTERNS.ATM_DEPOSIT.test(desc)) {
    return { type: 'ATM_DEPOSIT', subtype: null };
  }
  
  if (CHANNEL_PATTERNS.ATM_WITHDRAWAL.test(desc)) {
    return { type: 'ATM_WITHDRAWAL', subtype: null };
  }
  
  if (CHANNEL_PATTERNS.ZELLE_PAYMENT.test(desc) || CHANNEL_PATTERNS.ZELLE_GENERIC.test(desc)) {
    const match = CHANNEL_PATTERNS.ZELLE_PAYMENT.exec(desc);
    const recipient = match?.[1];
    const subtype = recipient !== undefined && recipient !== '' 
      ? `payment_${desc.toLowerCase().includes('from') ? 'from' : 'to'}_${recipient.trim()}` 
      : null;
    return { type: 'ZELLE', subtype };
  }
  
  if (CHANNEL_PATTERNS.FINANCIAL_CENTER_DEPOSIT.test(desc)) {
    return { type: 'FINANCIAL_CENTER_DEPOSIT', subtype: null };
  }
  
  if (section === 'checks' || CHANNEL_PATTERNS.CHECK.test(desc) || CHANNEL_PATTERNS.CHECK_PAID.test(desc)) {
    return { type: 'CHECK', subtype: null };
  }
  
  if (section === 'service_fees' || CHANNEL_PATTERNS.FEE.test(desc)) {
    return { type: 'FEE', subtype: null };
  }
  
  if (CHANNEL_PATTERNS.CHECKCARD.test(desc) || CHANNEL_PATTERNS.CHECKCARD_ALT.test(desc)) {
    return { type: 'CHECKCARD', subtype: null };
  }
  
  if (CHANNEL_PATTERNS.PURCHASE.test(desc)) {
    return { type: 'PURCHASE', subtype: null };
  }
  
  if (CHANNEL_PATTERNS.ATM_GENERIC.test(desc)) {
    return { type: 'ATM_WITHDRAWAL', subtype: null };
  }
  
  return { type: 'OTHER', subtype: null };
}

export function extractBankReference(description: string, channelType: ChannelType): BankReferenceInfo {
  const result: BankReferenceInfo = {
    cardTransactionTraceNumber: null,
    confirmationNumber: null,
    zelleConfirmation: null,
    checkNumber: null,
    atmId: null,
    terminalOrStoreId: null,
  };
  
  const traceMatch = TRACE_NUMBER_PATTERN.exec(description);
  const traceNumber = traceMatch?.[1];
  if (traceNumber !== undefined && traceNumber !== '' && channelType === 'CHECKCARD') {
    result.cardTransactionTraceNumber = traceNumber;
  }
  
  if (channelType === 'ONLINE_BANKING_TRANSFER') {
    const confMatch = CONFIRMATION_PATTERN.exec(description);
    const confNumber = confMatch?.[1];
    if (confNumber !== undefined && confNumber !== '') {
      result.confirmationNumber = confNumber;
    }
  }
  
  if (channelType === 'ZELLE') {
    const zelleMatch = ZELLE_CONF_PATTERN.exec(description);
    const zelleConf = zelleMatch?.[1];
    if (zelleConf !== undefined && zelleConf !== '') {
      result.zelleConfirmation = zelleConf;
    }
  }
  
  if (channelType === 'ATM_DEPOSIT' || channelType === 'ATM_WITHDRAWAL') {
    const atmMatch = ATM_ID_PATTERN.exec(description);
    const atmId = atmMatch?.[1];
    if (atmId !== undefined && atmId !== '') {
      result.atmId = atmId;
    }
  }
  
  if (channelType === 'CHECK') {
    const checkMatch = CHECK_NUMBER_PATTERN.exec(description);
    const checkNum = checkMatch?.[1];
    if (checkNum !== undefined && checkNum !== '') {
      result.checkNumber = checkNum;
    }
  }
  
  return result;
}

export function extractChannelAndReference(
  description: string,
  section?: string | null
): { channel: ChannelInfo; bankReference: BankReferenceInfo } {
  const channel = extractChannel(description, section);
  const bankReference = extractBankReference(description, channel.type);
  return { channel, bankReference };
}
