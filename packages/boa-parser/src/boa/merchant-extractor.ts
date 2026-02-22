/**
 * Merchant information extraction from transaction descriptions.
 * Extracts name, city, state, phone, and online flag.
 */

import type { MerchantInfo, CardNetwork } from '@findata/types';

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

const ONLINE_INDICATORS = [
  /\.com\b/i,
  /\.net\b/i,
  /\.org\b/i,
  /\*[A-Z0-9]+/i,
  /AMZN/i,
  /AMAZON/i,
  /PAYPAL/i,
  /GOOGLE\s*\*/i,
  /APPLE\.COM/i,
  /NETFLIX/i,
  /SPOTIFY/i,
  /UBER\s*\*?EATS/i,
  /DOORDASH/i,
  /GRUBHUB/i,
  /INSTACART/i,
];

const PHONE_PATTERN = /\b(\d{3}[-.]?\d{3}[-.]?\d{4})\b/;
const CITY_STATE_PATTERN = /\b([A-Z][A-Za-z\s]+)\s+([A-Z]{2})\s*$/;
const CITY_STATE_SLASH_PATTERN = /\b([A-Z][A-Za-z\s]+)\/([A-Z]{2})\b/;

const PREFIXES_TO_STRIP = [
  /^CHECKCARD\s+\d{4}\s+/i,
  /^PURCHASE\s+/i,
  /^POS\s+/i,
  /^DEBIT\s+/i,
  /^RECURRING\s+/i,
  /^PREAUTHORIZED\s+/i,
];

const SUFFIXES_TO_STRIP = [
  /\s+\d{17,25}$/,
  /\s+CARD\s+\d{4}$/i,
];

export function extractMerchant(description: string): MerchantInfo {
  let cleaned = description.trim();
  
  for (const prefix of PREFIXES_TO_STRIP) {
    cleaned = cleaned.replace(prefix, '');
  }
  
  for (const suffix of SUFFIXES_TO_STRIP) {
    cleaned = cleaned.replace(suffix, '');
  }
  
  cleaned = cleaned.trim();
  
  const phone = extractPhone(cleaned);
  const { city, state, remaining } = extractCityState(cleaned);
  const online = isOnlineMerchant(description);
  const network = detectCardNetwork(description);
  
  const name = extractMerchantName(remaining || cleaned);
  const normalizedName = normalizeMerchantName(name);
  
  return {
    name,
    normalizedName,
    city,
    state,
    phone,
    online,
    network,
  };
}

function extractPhone(text: string): string | null {
  const match = PHONE_PATTERN.exec(text);
  return match?.[1] ?? null;
}

function extractCityState(text: string): { city: string | null; state: string | null; remaining: string } {
  const slashMatch = CITY_STATE_SLASH_PATTERN.exec(text);
  if (slashMatch !== null) {
    const potentialState = slashMatch[2];
    if (potentialState !== undefined && US_STATES.has(potentialState)) {
      const city = slashMatch[1]?.trim() ?? null;
      const remaining = text.replace(CITY_STATE_SLASH_PATTERN, '').trim();
      return { city, state: potentialState, remaining };
    }
  }
  
  const match = CITY_STATE_PATTERN.exec(text);
  if (match !== null) {
    const potentialState = match[2];
    if (potentialState !== undefined && US_STATES.has(potentialState)) {
      const city = match[1]?.trim() ?? null;
      const remaining = text.replace(CITY_STATE_PATTERN, '').trim();
      return { city, state: potentialState, remaining };
    }
  }
  
  return { city: null, state: null, remaining: text };
}

function isOnlineMerchant(text: string): boolean {
  return ONLINE_INDICATORS.some((pattern) => pattern.test(text));
}

function detectCardNetwork(text: string): CardNetwork {
  if (/\bVISA\b/i.test(text)) return 'VISA';
  if (/\bMASTERCARD\b/i.test(text) || /\bMC\b/.test(text)) return 'MASTERCARD';
  if (/\bAMEX\b/i.test(text) || /\bAMERICAN\s*EXPRESS\b/i.test(text)) return 'AMEX';
  if (/\bDISCOVER\b/i.test(text)) return 'DISCOVER';
  return null;
}

function extractMerchantName(text: string): string | null {
  let name = text
    .replace(/\d{2}\/\d{2}/g, '')
    .replace(/\*+\d+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  name = name.replace(PHONE_PATTERN, '').trim();
  
  const patterns = [
    /^([A-Z][A-Z0-9\s&'.\-#]+?)(?:\s+\d|$)/i,
    /^([\w\s&'.\-#]+?)(?:\s+(?:CA|NY|TX|FL|WA|IL|PA|OH|GA|NC|MI|NJ|VA|AZ|MA|TN|IN|MO|MD|WI|CO|MN|SC|AL|LA|KY|OR|OK|CT|UT|IA|NV|AR|MS|KS|NM|NE|WV|ID|HI|NH|ME|MT|RI|DE|SD|ND|AK|VT|WY|DC)\s*$)/i,
  ];
  
  for (const pattern of patterns) {
    const match = pattern.exec(name);
    if (match?.[1] !== undefined && match[1].length > 2) {
      return match[1].trim();
    }
  }
  
  const words = name.split(/\s+/).slice(0, 5);
  if (words.length > 0) {
    const merchant = words.join(' ').replace(/[^A-Za-z0-9\s&'.\-#]/g, '').trim();
    return merchant.length > 2 ? merchant : null;
  }
  
  return null;
}

function normalizeMerchantName(name: string | null): string | null {
  if (name === null) return null;
  
  const normalizations: Record<string, string> = {
    'AMZN': 'Amazon',
    'AMAZON': 'Amazon',
    'AMZN.COM': 'Amazon',
    'AMAZON.COM': 'Amazon',
    'STARBUCKS': 'Starbucks',
    'SBUX': 'Starbucks',
    'MCDONALD': 'McDonald\'s',
    'MCDONALDS': 'McDonald\'s',
    'WALMART': 'Walmart',
    'WAL-MART': 'Walmart',
    'TARGET': 'Target',
    'COSTCO': 'Costco',
    'UBER': 'Uber',
    'UBER EATS': 'Uber Eats',
    'LYFT': 'Lyft',
    'DOORDASH': 'DoorDash',
    'GRUBHUB': 'Grubhub',
    'NETFLIX': 'Netflix',
    'SPOTIFY': 'Spotify',
    'APPLE': 'Apple',
    'GOOGLE': 'Google',
    'PAYPAL': 'PayPal',
    'VENMO': 'Venmo',
    'ZELLE': 'Zelle',
  };
  
  const upper = name.toUpperCase().trim();
  
  for (const [key, value] of Object.entries(normalizations)) {
    if (upper === key || upper.startsWith(key + ' ') || upper.includes(key)) {
      return value;
    }
  }
  
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
