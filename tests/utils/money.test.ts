import { describe, it, expect } from 'vitest';
import { parseAmount, roundToTwoDecimals, formatCurrency, sumAmounts } from '@findata/types';

describe('parseAmount', () => {
  it('should parse positive amounts', () => {
    expect(parseAmount('100.00')).toBe(100);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('$99.99')).toBe(99.99);
  });

  it('should parse negative amounts', () => {
    expect(parseAmount('-100.00')).toBe(-100);
    expect(parseAmount('(50.00)')).toBe(-50);
    expect(parseAmount('-$1,234.56')).toBe(-1234.56);
  });

  it('should handle whitespace', () => {
    expect(parseAmount(' 100.00 ')).toBe(100);
    expect(parseAmount('$ 50.00')).toBe(50);
  });

  it('should throw on invalid input', () => {
    expect(() => parseAmount('invalid')).toThrow('Unable to parse amount');
    expect(() => parseAmount('')).toThrow('Unable to parse amount');
  });
});

describe('roundToTwoDecimals', () => {
  it('should round to two decimal places', () => {
    expect(roundToTwoDecimals(100.456)).toBe(100.46);
    expect(roundToTwoDecimals(100.454)).toBe(100.45);
    expect(roundToTwoDecimals(100)).toBe(100);
  });
});

describe('formatCurrency', () => {
  it('should format positive amounts', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(100)).toBe('$100.00');
  });

  it('should format negative amounts', () => {
    expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
  });
});

describe('sumAmounts', () => {
  it('should sum amounts correctly', () => {
    expect(sumAmounts([100, 200, 300])).toBe(600);
    expect(sumAmounts([100.10, 200.20, 300.30])).toBe(600.6);
  });

  it('should handle empty array', () => {
    expect(sumAmounts([])).toBe(0);
  });

  it('should handle negative amounts', () => {
    expect(sumAmounts([100, -50, 25])).toBe(75);
  });
});
