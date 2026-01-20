import { CATEGORY_RULES, DEFAULT_CATEGORY, DEFAULT_CONFIDENCE, type CategoryRule } from './categories.js';

export interface CategorizationResult {
  category: string;
  subcategory: string | null;
  confidence: number;
  matchedRule: CategoryRule | null;
}

export function categorizeTransaction(description: string): CategorizationResult {
  const normalizedDesc = description.toLowerCase().trim();

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(normalizedDesc)) {
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        confidence: rule.confidence,
        matchedRule: rule,
      };
    }
  }

  return {
    category: DEFAULT_CATEGORY,
    subcategory: null,
    confidence: DEFAULT_CONFIDENCE,
    matchedRule: null,
  };
}

export function extractMerchant(description: string): string | null {
  const cleaned = description
    .replace(/\d{2}\/\d{2}/g, '')
    .replace(/\*+\d+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const merchantPatterns = [
    /^([A-Z][A-Z0-9\s&'.-]+?)(?:\s+\d|$)/i,
    /^([\w\s&'.-]+?)(?:\s+(?:CA|NY|TX|FL|WA|IL|PA|OH|GA|NC|MI|NJ|VA|AZ|MA|TN|IN|MO|MD|WI|CO|MN|SC|AL|LA|KY|OR|OK|CT|UT|IA|NV|AR|MS|KS|NM|NE|WV|ID|HI|NH|ME|MT|RI|DE|SD|ND|AK|VT|WY|DC)\s|$)/i,
  ];

  for (const pattern of merchantPatterns) {
    const match = pattern.exec(cleaned);
    if (match?.[1] !== undefined && match[1].length > 2) {
      return match[1].trim();
    }
  }

  const words = cleaned.split(/\s+/).slice(0, 4);
  if (words.length > 0) {
    const merchant = words.join(' ').replace(/[^A-Za-z0-9\s&'.-]/g, '').trim();
    return merchant.length > 2 ? merchant : null;
  }

  return null;
}

export function getMerchantConfidence(merchant: string | null, category: string): number {
  if (merchant === null) return 0.3;
  if (category === DEFAULT_CATEGORY) return 0.5;
  return 0.8;
}
