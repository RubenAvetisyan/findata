import { describe, it, expect } from 'vitest';
import { categorizeTransaction, extractMerchant } from '../../src/categorization/categorizer.js';

describe('categorizeTransaction', () => {
  it('should categorize income transactions', () => {
    const result = categorizeTransaction('PAYROLL DIRECT DEP ACME CORP');
    expect(result.category).toBe('Income');
    expect(result.subcategory).toBe('Salary');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('should categorize food & dining transactions', () => {
    const result = categorizeTransaction('STARBUCKS STORE 12345');
    expect(result.category).toBe('Food & Dining');
    expect(result.subcategory).toBe('Restaurants');
  });

  it('should categorize transportation transactions', () => {
    const result = categorizeTransaction('UBER TRIP');
    expect(result.category).toBe('Transportation');
    expect(result.subcategory).toBe('Rideshare');
  });

  it('should categorize shopping transactions', () => {
    const result = categorizeTransaction('AMAZON.COM*123ABC');
    expect(result.category).toBe('Shopping');
    expect(result.subcategory).toBe('Online');
  });

  it('should categorize entertainment subscriptions', () => {
    const result = categorizeTransaction('NETFLIX.COM');
    expect(result.category).toBe('Entertainment');
    expect(result.subcategory).toBe('Streaming');
  });

  it('should categorize ATM withdrawals', () => {
    const result = categorizeTransaction('ATM WITHDRAWAL 123 MAIN ST');
    expect(result.category).toBe('Financial');
    expect(result.subcategory).toBe('ATM');
  });

  it('should return Uncategorized for unknown transactions', () => {
    const result = categorizeTransaction('RANDOM UNKNOWN MERCHANT XYZ');
    expect(result.category).toBe('Uncategorized');
    expect(result.confidence).toBe(0.5);
  });

  it('should be case insensitive', () => {
    const lower = categorizeTransaction('netflix.com');
    const upper = categorizeTransaction('NETFLIX.COM');
    expect(lower.category).toBe(upper.category);
  });
});

describe('extractMerchant', () => {
  it('should extract merchant name from description', () => {
    expect(extractMerchant('STARBUCKS STORE 12345 CA')).toBe('STARBUCKS STORE');
    const amazonMerchant = extractMerchant('AMAZON.COM*123ABC');
    expect(amazonMerchant).toBeTruthy();
    expect(amazonMerchant?.toLowerCase()).toContain('amazon');
  });

  it('should handle descriptions with dates', () => {
    const merchant = extractMerchant('01/15 UBER TRIP');
    expect(merchant).toBeTruthy();
  });

  it('should return null for very short descriptions', () => {
    expect(extractMerchant('AB')).toBeNull();
  });
});
