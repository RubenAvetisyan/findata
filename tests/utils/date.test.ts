import { describe, it, expect } from 'vitest';
import { parseUSDate, inferStatementYear, isValidISODate, compareDates } from '@findata/types';

describe('parseUSDate', () => {
  it('should parse MM/DD/YY format', () => {
    expect(parseUSDate('01/15/24')).toBe('2024-01-15');
    expect(parseUSDate('12/31/23')).toBe('2023-12-31');
  });

  it('should parse MM/DD/YYYY format', () => {
    expect(parseUSDate('01/15/2024')).toBe('2024-01-15');
    expect(parseUSDate('12/31/2023')).toBe('2023-12-31');
  });

  it('should parse MM/DD format with statement year', () => {
    expect(parseUSDate('01/15', 2024)).toBe('2024-01-15');
    expect(parseUSDate('12/31', 2023)).toBe('2023-12-31');
  });

  it('should parse month name format', () => {
    expect(parseUSDate('Jan 15', 2024)).toBe('2024-01-15');
    expect(parseUSDate('Dec 31', 2023)).toBe('2023-12-31');
  });

  it('should handle single digit months and days', () => {
    expect(parseUSDate('1/5/24')).toBe('2024-01-05');
    expect(parseUSDate('9/1', 2024)).toBe('2024-09-01');
  });

  it('should throw on invalid date format', () => {
    expect(() => parseUSDate('invalid')).toThrow('Unable to parse date');
    expect(() => parseUSDate('2024-01-15')).toThrow('Unable to parse date');
  });
});

describe('inferStatementYear', () => {
  it('should extract year from end date', () => {
    expect(inferStatementYear('2024-01-01', '2024-01-31')).toBe(2024);
    expect(inferStatementYear('2023-12-01', '2024-01-15')).toBe(2024);
  });
});

describe('isValidISODate', () => {
  it('should validate ISO date format', () => {
    expect(isValidISODate('2024-01-15')).toBe(true);
    expect(isValidISODate('2024-12-31')).toBe(true);
  });

  it('should reject invalid formats', () => {
    expect(isValidISODate('01/15/2024')).toBe(false);
    expect(isValidISODate('2024-1-15')).toBe(false);
    expect(isValidISODate('invalid')).toBe(false);
  });
});

describe('compareDates', () => {
  it('should compare dates correctly', () => {
    expect(compareDates('2024-01-15', '2024-01-16')).toBeLessThan(0);
    expect(compareDates('2024-01-16', '2024-01-15')).toBeGreaterThan(0);
    expect(compareDates('2024-01-15', '2024-01-15')).toBe(0);
  });
});
