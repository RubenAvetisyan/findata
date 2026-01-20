/**
 * Row clustering utilities for layout-aware PDF parsing.
 * Groups text items into rows based on Y-coordinate proximity.
 */
import type { TextItem } from '../extractors/layout-pdfjs.js';

/**
 * A row of text items, sorted by X coordinate.
 */
export interface Row {
  /** Y coordinate of the row (average of items) */
  y: number;
  /** Page number */
  page: number;
  /** Text items in this row, sorted by X */
  items: TextItem[];
  /** Concatenated text of all items in the row */
  text: string;
}

/**
 * Group text items into rows based on Y-coordinate proximity.
 * Items within yTolerance of each other are considered part of the same row.
 * 
 * @param items - Text items to group
 * @param yTolerance - Maximum Y difference to consider items on same row (default: 3.0)
 * @returns Array of rows, sorted by Y (top to bottom for typical PDF coordinates)
 */
export function groupByRows(items: TextItem[], yTolerance: number = 3.0): Row[] {
  if (items.length === 0) return [];
  
  // Group items by page first
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    const pageItems = byPage.get(item.page) ?? [];
    pageItems.push(item);
    byPage.set(item.page, pageItems);
  }
  
  const allRows: Row[] = [];
  
  for (const [page, pageItems] of byPage) {
    // Sort by Y descending (PDF coordinates: higher Y = higher on page)
    const sorted = [...pageItems].sort((a, b) => b.y - a.y);
    
    const rows: Row[] = [];
    let currentRow: TextItem[] = [];
    let currentY = sorted[0]?.y ?? 0;
    
    for (const item of sorted) {
      if (Math.abs(item.y - currentY) <= yTolerance) {
        currentRow.push(item);
      } else {
        if (currentRow.length > 0) {
          rows.push(createRow(currentRow, page));
        }
        currentRow = [item];
        currentY = item.y;
      }
    }
    
    // Don't forget the last row
    if (currentRow.length > 0) {
      rows.push(createRow(currentRow, page));
    }
    
    allRows.push(...rows);
  }
  
  return allRows;
}

/**
 * Create a Row from a list of items on the same line.
 */
function createRow(items: TextItem[], page: number): Row {
  // Sort items by X coordinate (left to right)
  const sorted = [...items].sort((a, b) => a.x - b.x);
  
  // Calculate average Y
  const avgY = items.reduce((sum, item) => sum + item.y, 0) / items.length;
  
  // Build text with appropriate spacing
  const text = buildRowText(sorted);
  
  return {
    y: avgY,
    page,
    items: sorted,
    text,
  };
}

/**
 * Build row text from sorted items, inserting spaces based on gaps.
 */
function buildRowText(sortedItems: TextItem[]): string {
  if (sortedItems.length === 0) return '';
  if (sortedItems.length === 1) return sortedItems[0]?.str ?? '';
  
  let text = sortedItems[0]?.str ?? '';
  
  for (let i = 1; i < sortedItems.length; i++) {
    const prev = sortedItems[i - 1];
    const curr = sortedItems[i];
    if (!prev || !curr) continue;
    
    // Calculate gap between items
    const prevEnd = prev.x + prev.width;
    const gap = curr.x - prevEnd;
    
    // Insert space if there's a significant gap
    // Use average character width as threshold
    const avgCharWidth = prev.width / Math.max(prev.str.length, 1);
    
    if (gap > avgCharWidth * 0.5) {
      text += ' ';
    }
    
    text += curr.str;
  }
  
  return text;
}

/**
 * Sort a row's items by X coordinate.
 * (Usually already sorted, but this ensures it)
 */
export function sortRowByX(row: Row): Row {
  const sorted = [...row.items].sort((a, b) => a.x - b.x);
  return {
    ...row,
    items: sorted,
    text: buildRowText(sorted),
  };
}

/**
 * Merge wrapped descriptions that span multiple rows.
 * 
 * Detects continuation lines (lines without a date prefix that follow
 * a transaction line) and merges them into the previous row.
 * 
 * @param rows - Rows to process
 * @param datePattern - Pattern to identify transaction start lines
 * @returns Rows with wrapped descriptions merged
 */
export function mergeWrappedDescriptions(
  rows: Row[],
  datePattern: RegExp = /^\d{2}\/\d{2}(?:\/\d{2,4})?/
): Row[] {
  if (rows.length === 0) return [];
  
  const result: Row[] = [];
  let pendingRow: Row | null = null;
  
  for (const row of rows) {
    const startsWithDate = datePattern.test(row.text.trim());
    
    if (startsWithDate) {
      // This is a new transaction line
      if (pendingRow !== null) {
        result.push(pendingRow);
      }
      pendingRow = row;
    } else if (pendingRow !== null) {
      // This is a continuation line - merge with pending
      pendingRow = mergeRows(pendingRow, row);
    } else {
      // No pending row, just add this one
      result.push(row);
    }
  }
  
  // Don't forget the last pending row
  if (pendingRow !== null) {
    result.push(pendingRow);
  }
  
  return result;
}

/**
 * Merge two rows into one (for wrapped descriptions).
 */
function mergeRows(first: Row, second: Row): Row {
  return {
    y: first.y,
    page: first.page,
    items: [...first.items, ...second.items],
    text: first.text + ' ' + second.text,
  };
}

/**
 * Filter rows to only those within a Y-coordinate range.
 * Useful for extracting specific sections of a page.
 */
export function filterRowsByYRange(rows: Row[], minY: number, maxY: number): Row[] {
  return rows.filter(row => row.y >= minY && row.y <= maxY);
}

/**
 * Get rows for a specific page.
 */
export function getRowsForPage(rows: Row[], page: number): Row[] {
  return rows.filter(row => row.page === page);
}
