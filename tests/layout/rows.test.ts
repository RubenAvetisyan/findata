/**
 * Tests for row clustering utilities.
 */
import { describe, it, expect } from 'vitest';
import { 
  groupByRows, 
  sortRowByX, 
  mergeWrappedDescriptions,
  filterRowsByYRange,
  getRowsForPage,
} from '@findata/pdf-extract';
import type { TextItem } from '@findata/pdf-extract';

describe('groupByRows', () => {
  it('should group items with similar Y coordinates into rows', () => {
    const items: TextItem[] = [
      { str: 'Date', x: 50, y: 700, width: 30, height: 12, page: 1 },
      { str: 'Description', x: 150, y: 700, width: 80, height: 12, page: 1 },
      { str: 'Amount', x: 400, y: 700, width: 50, height: 12, page: 1 },
      { str: '03/15/25', x: 50, y: 680, width: 50, height: 12, page: 1 },
      { str: 'STARBUCKS', x: 150, y: 680, width: 70, height: 12, page: 1 },
      { str: '-5.50', x: 400, y: 680, width: 40, height: 12, page: 1 },
    ];
    
    const rows = groupByRows(items, 3.0);
    
    expect(rows).toHaveLength(2);
    expect(rows[0]?.items).toHaveLength(3);
    expect(rows[1]?.items).toHaveLength(3);
  });
  
  it('should handle items on different pages separately', () => {
    const items: TextItem[] = [
      { str: 'Page1Item', x: 50, y: 700, width: 60, height: 12, page: 1 },
      { str: 'Page2Item', x: 50, y: 700, width: 60, height: 12, page: 2 },
    ];
    
    const rows = groupByRows(items, 3.0);
    
    expect(rows).toHaveLength(2);
    expect(rows[0]?.page).toBe(1);
    expect(rows[1]?.page).toBe(2);
  });
  
  it('should sort items within a row by X coordinate', () => {
    const items: TextItem[] = [
      { str: 'Third', x: 300, y: 700, width: 40, height: 12, page: 1 },
      { str: 'First', x: 50, y: 700, width: 40, height: 12, page: 1 },
      { str: 'Second', x: 150, y: 700, width: 50, height: 12, page: 1 },
    ];
    
    const rows = groupByRows(items, 3.0);
    
    expect(rows).toHaveLength(1);
    expect(rows[0]?.items[0]?.str).toBe('First');
    expect(rows[0]?.items[1]?.str).toBe('Second');
    expect(rows[0]?.items[2]?.str).toBe('Third');
  });
  
  it('should return empty array for empty input', () => {
    const rows = groupByRows([], 3.0);
    expect(rows).toHaveLength(0);
  });
  
  it('should build row text with appropriate spacing', () => {
    const items: TextItem[] = [
      { str: 'Hello', x: 50, y: 700, width: 40, height: 12, page: 1 },
      { str: 'World', x: 100, y: 700, width: 40, height: 12, page: 1 },
    ];
    
    const rows = groupByRows(items, 3.0);
    
    expect(rows[0]?.text).toBe('Hello World');
  });
});

describe('sortRowByX', () => {
  it('should sort row items by X coordinate', () => {
    const row = {
      y: 700,
      page: 1,
      items: [
        { str: 'B', x: 200, y: 700, width: 20, height: 12, page: 1 },
        { str: 'A', x: 50, y: 700, width: 20, height: 12, page: 1 },
      ],
      text: 'B A',
    };
    
    const sorted = sortRowByX(row);
    
    expect(sorted.items[0]?.str).toBe('A');
    expect(sorted.items[1]?.str).toBe('B');
  });
});

describe('mergeWrappedDescriptions', () => {
  it('should merge continuation lines with previous transaction', () => {
    const rows = [
      { y: 700, page: 1, items: [], text: '03/15/25 AMAZON.COM' },
      { y: 680, page: 1, items: [], text: 'SEATTLE WA -25.00' },
      { y: 660, page: 1, items: [], text: '03/16/25 STARBUCKS -5.50' },
    ];
    
    const merged = mergeWrappedDescriptions(rows);
    
    expect(merged).toHaveLength(2);
    expect(merged[0]?.text).toContain('AMAZON.COM');
    expect(merged[0]?.text).toContain('SEATTLE WA');
  });
  
  it('should not merge lines that start with dates', () => {
    const rows = [
      { y: 700, page: 1, items: [], text: '03/15/25 AMAZON.COM -25.00' },
      { y: 680, page: 1, items: [], text: '03/16/25 STARBUCKS -5.50' },
    ];
    
    const merged = mergeWrappedDescriptions(rows);
    
    expect(merged).toHaveLength(2);
  });
  
  it('should handle empty input', () => {
    const merged = mergeWrappedDescriptions([]);
    expect(merged).toHaveLength(0);
  });
});

describe('filterRowsByYRange', () => {
  it('should filter rows within Y range', () => {
    const rows = [
      { y: 700, page: 1, items: [], text: 'Row 1' },
      { y: 600, page: 1, items: [], text: 'Row 2' },
      { y: 500, page: 1, items: [], text: 'Row 3' },
    ];
    
    const filtered = filterRowsByYRange(rows, 550, 650);
    
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.text).toBe('Row 2');
  });
});

describe('getRowsForPage', () => {
  it('should return rows for specific page', () => {
    const rows = [
      { y: 700, page: 1, items: [], text: 'Page 1 Row' },
      { y: 700, page: 2, items: [], text: 'Page 2 Row' },
      { y: 600, page: 1, items: [], text: 'Page 1 Row 2' },
    ];
    
    const page1Rows = getRowsForPage(rows, 1);
    
    expect(page1Rows).toHaveLength(2);
    expect(page1Rows.every(r => r.page === 1)).toBe(true);
  });
});
