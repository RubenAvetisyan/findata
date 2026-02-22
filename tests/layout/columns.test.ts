/**
 * Tests for column detection utilities.
 */
import { describe, it, expect } from 'vitest';
import { 
  detectColumnsFromHeader,
  inferColumnsByXClusters,
  getColumnForItem,
  mapRowToColumns,
  extractBoaTransactionFromRow,
} from '@findata/pdf-extract';
import type { TextItem } from '@findata/pdf-extract';
import type { Row } from '@findata/pdf-extract';

describe('detectColumnsFromHeader', () => {
  it('should detect columns from header row', () => {
    const headerRow: Row = {
      y: 700,
      page: 1,
      items: [
        { str: 'Date', x: 50, y: 700, width: 30, height: 12, page: 1 },
        { str: 'Description', x: 150, y: 700, width: 80, height: 12, page: 1 },
        { str: 'Amount', x: 400, y: 700, width: 50, height: 12, page: 1 },
      ],
      text: 'Date Description Amount',
    };
    
    const mapping = detectColumnsFromHeader(headerRow, 612);
    
    expect(mapping.columns).toHaveLength(3);
    expect(mapping.columns[0]?.name).toBe('Date');
    expect(mapping.columns[1]?.name).toBe('Description');
    expect(mapping.columns[2]?.name).toBe('Amount');
    expect(mapping.byName.get('date')).toBe(0);
    expect(mapping.byName.get('description')).toBe(1);
    expect(mapping.byName.get('amount')).toBe(2);
  });
  
  it('should handle empty header row', () => {
    const headerRow: Row = {
      y: 700,
      page: 1,
      items: [],
      text: '',
    };
    
    const mapping = detectColumnsFromHeader(headerRow);
    
    expect(mapping.columns).toHaveLength(0);
  });
});

describe('inferColumnsByXClusters', () => {
  it('should infer columns from X position clusters', () => {
    const rows: Row[] = [
      {
        y: 700,
        page: 1,
        items: [
          { str: '03/15', x: 50, y: 700, width: 40, height: 12, page: 1 },
          { str: 'STARBUCKS', x: 150, y: 700, width: 70, height: 12, page: 1 },
          { str: '-5.50', x: 400, y: 700, width: 40, height: 12, page: 1 },
        ],
        text: '03/15 STARBUCKS -5.50',
      },
      {
        y: 680,
        page: 1,
        items: [
          { str: '03/16', x: 52, y: 680, width: 40, height: 12, page: 1 },
          { str: 'AMAZON', x: 148, y: 680, width: 50, height: 12, page: 1 },
          { str: '-25.00', x: 398, y: 680, width: 45, height: 12, page: 1 },
        ],
        text: '03/16 AMAZON -25.00',
      },
    ];
    
    const mapping = inferColumnsByXClusters(rows, 10);
    
    expect(mapping.columns.length).toBeGreaterThanOrEqual(3);
  });
  
  it('should handle empty rows', () => {
    const mapping = inferColumnsByXClusters([]);
    expect(mapping.columns).toHaveLength(0);
  });
});

describe('getColumnForItem', () => {
  it('should return correct column index for item', () => {
    const columns = [
      { name: 'date', left: 40, right: 100, index: 0 },
      { name: 'description', left: 100, right: 350, index: 1 },
      { name: 'amount', left: 350, right: 500, index: 2 },
    ];
    
    const item: TextItem = { str: 'STARBUCKS', x: 150, y: 700, width: 70, height: 12, page: 1 };
    
    expect(getColumnForItem(item, columns)).toBe(1);
  });
  
  it('should return -1 for item outside all columns', () => {
    const columns = [
      { name: 'date', left: 100, right: 200, index: 0 },
    ];
    
    const item: TextItem = { str: 'Outside', x: 50, y: 700, width: 40, height: 12, page: 1 };
    
    expect(getColumnForItem(item, columns)).toBe(-1);
  });
});

describe('mapRowToColumns', () => {
  it('should map row items to columns', () => {
    const columns = [
      { name: 'date', left: 40, right: 100, index: 0 },
      { name: 'description', left: 100, right: 350, index: 1 },
      { name: 'amount', left: 350, right: 500, index: 2 },
    ];
    
    const row: Row = {
      y: 700,
      page: 1,
      items: [
        { str: '03/15', x: 50, y: 700, width: 40, height: 12, page: 1 },
        { str: 'STARBUCKS', x: 150, y: 700, width: 70, height: 12, page: 1 },
        { str: '-5.50', x: 400, y: 700, width: 40, height: 12, page: 1 },
      ],
      text: '03/15 STARBUCKS -5.50',
    };
    
    const mapped = mapRowToColumns(row, columns);
    
    expect(mapped).toHaveLength(3);
    expect(mapped[0]).toBe('03/15');
    expect(mapped[1]).toBe('STARBUCKS');
    expect(mapped[2]).toBe('-5.50');
  });
});

describe('extractBoaTransactionFromRow', () => {
  it('should extract transaction from BOA format row', () => {
    const row: Row = {
      y: 700,
      page: 1,
      items: [
        { str: '03/15/25', x: 50, y: 700, width: 50, height: 12, page: 1 },
        { str: 'STARBUCKS STORE 12345', x: 120, y: 700, width: 150, height: 12, page: 1 },
        { str: '-5.50', x: 400, y: 700, width: 40, height: 12, page: 1 },
      ],
      text: '03/15/25 STARBUCKS STORE 12345 -5.50',
    };
    
    const txn = extractBoaTransactionFromRow(row);
    
    expect(txn).not.toBeNull();
    expect(txn?.date).toBe('03/15/25');
    expect(txn?.description).toContain('STARBUCKS');
    expect(txn?.amount).toBe('-5.50');
  });
  
  it('should return null for non-transaction row', () => {
    const row: Row = {
      y: 700,
      page: 1,
      items: [
        { str: 'Total deposits', x: 50, y: 700, width: 100, height: 12, page: 1 },
      ],
      text: 'Total deposits',
    };
    
    const txn = extractBoaTransactionFromRow(row);
    
    expect(txn).toBeNull();
  });
  
  it('should handle empty row', () => {
    const row: Row = {
      y: 700,
      page: 1,
      items: [],
      text: '',
    };
    
    const txn = extractBoaTransactionFromRow(row);
    
    expect(txn).toBeNull();
  });
});
