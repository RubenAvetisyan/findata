/**
 * Column detection utilities for layout-aware PDF parsing.
 * Detects and maps columns in tabular data based on X-coordinate clustering.
 */
import type { TextItem } from '../layout-pdfjs.js';
import type { Row } from './rows.js';

/**
 * A detected column with its boundaries.
 */
export interface Column {
  /** Column name/header (if detected) */
  name: string;
  /** Left X boundary */
  left: number;
  /** Right X boundary */
  right: number;
  /** Column index (0-based) */
  index: number;
}

/**
 * Column mapping for a specific table layout.
 */
export interface ColumnMapping {
  /** Detected columns */
  columns: Column[];
  /** Map column name to index */
  byName: Map<string, number>;
}

/**
 * Detect columns from a header row.
 * Uses the X positions of header items to define column boundaries.
 * 
 * @param headerRow - Row containing column headers
 * @param pageWidth - Width of the page (for rightmost column boundary)
 * @returns Column mapping
 */
export function detectColumnsFromHeader(headerRow: Row, pageWidth: number = 612): ColumnMapping {
  const items = headerRow.items;
  if (items.length === 0) {
    return { columns: [], byName: new Map() };
  }
  
  const columns: Column[] = [];
  const byName = new Map<string, number>();
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    
    const nextItem = items[i + 1];
    const left = item.x;
    const right = nextItem ? nextItem.x - 1 : pageWidth;
    
    const column: Column = {
      name: item.str.trim(),
      left,
      right,
      index: i,
    };
    
    columns.push(column);
    byName.set(column.name.toLowerCase(), i);
  }
  
  return { columns, byName };
}

/**
 * Infer columns by clustering X coordinates across multiple rows.
 * Useful when there's no clear header row.
 * 
 * @param rows - Rows to analyze
 * @param xTolerance - Maximum X difference to consider same column (default: 10)
 * @returns Column mapping with generic names (col0, col1, etc.)
 */
export function inferColumnsByXClusters(rows: Row[], xTolerance: number = 10): ColumnMapping {
  if (rows.length === 0) {
    return { columns: [], byName: new Map() };
  }
  
  // Collect all X positions
  const xPositions: number[] = [];
  for (const row of rows) {
    for (const item of row.items) {
      xPositions.push(item.x);
    }
  }
  
  if (xPositions.length === 0) {
    return { columns: [], byName: new Map() };
  }
  
  // Sort and cluster X positions
  xPositions.sort((a, b) => a - b);
  
  const clusters: number[][] = [];
  let currentCluster: number[] = [xPositions[0] ?? 0];
  
  for (let i = 1; i < xPositions.length; i++) {
    const x = xPositions[i];
    const prevX = xPositions[i - 1];
    if (x === undefined || prevX === undefined) continue;
    
    if (x - prevX <= xTolerance) {
      currentCluster.push(x);
    } else {
      clusters.push(currentCluster);
      currentCluster = [x];
    }
  }
  clusters.push(currentCluster);
  
  // Create columns from clusters
  const columns: Column[] = [];
  const byName = new Map<string, number>();
  
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    if (!cluster || cluster.length === 0) continue;
    
    const minX = Math.min(...cluster);
    const nextCluster = clusters[i + 1];
    
    const column: Column = {
      name: `col${i}`,
      left: minX,
      right: nextCluster ? Math.min(...nextCluster) - 1 : minX + 200,
      index: i,
    };
    
    columns.push(column);
    byName.set(column.name, i);
  }
  
  return { columns, byName };
}

/**
 * Map a text item to its column based on X position.
 * 
 * @param item - Text item to map
 * @param columns - Column definitions
 * @returns Column index, or -1 if not in any column
 */
export function getColumnForItem(item: TextItem, columns: Column[]): number {
  for (const col of columns) {
    if (item.x >= col.left && item.x < col.right) {
      return col.index;
    }
  }
  return -1;
}

/**
 * Map a row's items to columns.
 * 
 * @param row - Row to map
 * @param columns - Column definitions
 * @returns Array of strings, one per column (empty string if no item in column)
 */
export function mapRowToColumns(row: Row, columns: Column[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < columns.length; i++) {
    result.push('');
  }
  
  for (const item of row.items) {
    const colIndex = getColumnForItem(item, columns);
    if (colIndex >= 0 && colIndex < result.length) {
      // Append to existing content (for multi-item columns)
      const current = result[colIndex];
      if (current !== undefined && current !== '') {
        result[colIndex] = current + ' ' + item.str;
      } else {
        result[colIndex] = item.str;
      }
    }
  }
  
  return result;
}

/**
 * BOA-specific column detection for checking statement transactions.
 * Looks for "Date", "Description", "Amount" pattern.
 */
export function detectBoaTransactionColumns(rows: Row[]): ColumnMapping | null {
  // Look for header row with Date, Description, Amount
  for (const row of rows) {
    const text = row.text.toLowerCase();
    if (text.includes('date') && (text.includes('description') || text.includes('transaction'))) {
      // Found header row
      const columns: Column[] = [];
      const byName = new Map<string, number>();
      
      // Find Date column
      const dateItem = row.items.find(item => 
        item.str.toLowerCase().includes('date')
      );
      
      // Find Amount column (usually rightmost)
      const amountItem = row.items.find(item => 
        item.str.toLowerCase().includes('amount')
      );
      
      if (dateItem) {
        columns.push({
          name: 'date',
          left: dateItem.x - 5,
          right: dateItem.x + 60,
          index: 0,
        });
        byName.set('date', 0);
      }
      
      // Description is between date and amount
      if (dateItem && amountItem) {
        columns.push({
          name: 'description',
          left: dateItem.x + 60,
          right: amountItem.x - 5,
          index: 1,
        });
        byName.set('description', 1);
      }
      
      if (amountItem) {
        columns.push({
          name: 'amount',
          left: amountItem.x - 5,
          right: 612, // Page width
          index: columns.length,
        });
        byName.set('amount', columns.length - 1);
      }
      
      if (columns.length >= 2) {
        return { columns, byName };
      }
    }
  }
  
  return null;
}

/**
 * Extract column values from a row using BOA transaction layout.
 * Handles the typical Date | Description | Amount format.
 */
export function extractBoaTransactionFromRow(row: Row): {
  date: string;
  description: string;
  amount: string;
} | null {
  const items = row.items;
  if (items.length === 0) return null;
  
  // First item should be date (MM/DD/YY format)
  const firstItem = items[0];
  if (!firstItem) return null;
  
  const dateMatch = /^\d{2}\/\d{2}(?:\/\d{2,4})?/.exec(firstItem.str);
  if (!dateMatch) return null;
  
  const date = dateMatch[0];
  
  // Last item (or items) should be amount
  // Amount is typically right-aligned, so look for number pattern from the right
  let amountStr = '';
  let descriptionItems: TextItem[] = [];
  
  // Find amount from right side
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item) continue;
    
    const amountMatch = /-?[\d,]+\.\d{2}$/.exec(item.str);
    if (amountMatch) {
      amountStr = amountMatch[0];
      // Everything between date and amount is description
      descriptionItems = items.slice(0, i);
      // Remove date from description items
      const firstDescItem = descriptionItems[0];
      if (firstDescItem !== undefined && firstDescItem.str.startsWith(date)) {
        const remaining = firstDescItem.str.slice(date.length).trim();
        if (remaining.length > 0) {
          descriptionItems[0] = { ...firstDescItem, str: remaining };
        } else {
          descriptionItems = descriptionItems.slice(1);
        }
      }
      break;
    }
  }
  
  if (!amountStr) return null;
  
  const description = descriptionItems.map(item => item.str).join(' ').trim();
  
  return { date, description, amount: amountStr };
}
