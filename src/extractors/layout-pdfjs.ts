/**
 * Layout-aware PDF extraction using pdfjs-dist.
 * Extracts text items with positional coordinates for reliable row/column reconstruction.
 * 
 * This module uses pdfjs-dist to extract text with positional data, enabling
 * reliable row/column reconstruction for table parsing.
 */
import { readFile } from 'fs/promises';

/**
 * A text item with positional information extracted from PDF.
 */
export interface TextItem {
  /** The text content */
  str: string;
  /** X coordinate (left edge) in PDF units */
  x: number;
  /** Y coordinate in PDF units (origin typically bottom-left) */
  y: number;
  /** Width of the text item */
  width: number;
  /** Height of the text item (approximated from font size) */
  height: number;
  /** Page number (1-indexed) */
  page: number;
}

/**
 * Result of layout-aware PDF extraction.
 */
export interface LayoutExtractedPDF {
  /** All text items with positions */
  items: TextItem[];
  /** Total number of pages */
  totalPages: number;
  /** Metadata from the PDF */
  metadata: {
    title?: string | undefined;
    author?: string | undefined;
    creationDate?: string | undefined;
  };
}

/**
 * Internal interface for pdfjs text items.
 */
interface PdfjsTextItemLike {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
}

/**
 * Extract text items with positional coordinates from a PDF file.
 * 
 * @param filePath - Path to the PDF file
 * @returns Promise resolving to extracted items with positions
 */
export async function extractTextItems(filePath: string): Promise<LayoutExtractedPDF> {
  const dataBuffer = await readFile(filePath);
  return extractTextItemsFromBuffer(new Uint8Array(dataBuffer));
}

/**
 * Extract text items from a buffer.
 */
export async function extractTextItemsFromBuffer(buffer: Buffer | Uint8Array): Promise<LayoutExtractedPDF> {
  // Dynamic import for pdfjs-dist (ESM compatibility)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
  });
  
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const pdfDocument = await loadingTask.promise;
  const items: TextItem[] = [];
  
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const numPages: number = pdfDocument.numPages;
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const page = await pdfDocument.getPage(pageNum);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const textContent = await page.getTextContent();
    
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const contentItems = textContent.items as unknown[];
    
    for (const item of contentItems) {
      // Type guard: only process actual text items (not marked content)
      if (!isTextItem(item)) continue;
      
      const str = item.str.trim();
      if (str.length === 0) continue;
      
      // Extract position from transform matrix [scaleX, skewX, skewY, scaleY, translateX, translateY]
      const transform = item.transform;
      const x = Number(transform[4]) || 0;
      const y = Number(transform[5]) || 0;
      
      // Width and height from item properties or approximated from transform
      const width = Number(item.width) || Math.abs(Number(transform[0]) || 1) * str.length * 0.6;
      const height = Number(item.height) || Math.abs(Number(transform[3]) || 12);
      
      items.push({
        str,
        x,
        y,
        width,
        height,
        page: pageNum,
      });
    }
  }
  
  // Extract metadata safely
  let title: string | undefined;
  let author: string | undefined;
  let creationDate: string | undefined;
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const metadata = await pdfDocument.getMetadata();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const info = metadata?.info as Record<string, unknown> | undefined;
    if (info) {
      if (typeof info['Title'] === 'string') title = info['Title'];
      if (typeof info['Author'] === 'string') author = info['Author'];
      if (typeof info['CreationDate'] === 'string') creationDate = info['CreationDate'];
    }
  } catch {
    // Metadata extraction failed, continue without it
  }
  
  return {
    items,
    totalPages: numPages,
    metadata: {
      title,
      author,
      creationDate,
    },
  };
}

/**
 * Type guard to check if an item is a TextItem (has str property).
 */
function isTextItem(item: unknown): item is PdfjsTextItemLike {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof (item as PdfjsTextItemLike).str === 'string' &&
    'transform' in item &&
    Array.isArray((item as PdfjsTextItemLike).transform)
  );
}

/**
 * Build lines from text items using layout-aware gap detection.
 * This reconstructs rows from positional data and inserts separators
 * between columns to prevent text from being "glued" together.
 * 
 * @param items - Text items with positional data
 * @returns Array of reconstructed lines with proper spacing
 */
export function buildLinesFromItems(items: TextItem[]): string[] {
  const Y_TOL = 2.0;        // Row grouping tolerance (items within this Y distance are same row)
  const SPACE_GAP = 2.5;    // Small gap -> insert space
  const COLUMN_GAP = 18;    // Large gap -> insert tab (column separator)

  if (items.length === 0) return [];

  // Sort by Y descending (top to bottom), then X ascending (left to right)
  const sorted = [...items].sort((a, b) => (b.y - a.y) || (a.x - b.x));

  // Group items into rows based on Y coordinate
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const lastRow = rows[rows.length - 1];
    if (!lastRow) {
      rows.push([item]);
      continue;
    }
    const rowY = lastRow[0]!.y;
    if (Math.abs(item.y - rowY) <= Y_TOL) {
      lastRow.push(item);
    } else {
      rows.push([item]);
    }
  }

  // Convert each row to a string with gap-based separators
  const lines: string[] = [];
  for (const row of rows) {
    // Sort row items by X (left to right)
    row.sort((a, b) => a.x - b.x);

    let out = '';
    let prevEndX: number | null = null;

    for (const item of row) {
      const text = item.str;
      if (!text) continue;

      if (prevEndX !== null) {
        const gap = item.x - prevEndX;
        if (gap > COLUMN_GAP) {
          out += '\t';      // Strong column separator
        } else if (gap > SPACE_GAP) {
          out += ' ';       // Normal space
        }
      }

      out += text;
      prevEndX = item.x + item.width;
    }

    // Clean trailing whitespace
    const cleaned = out.replace(/[ \t]+$/g, '');
    if (cleaned) {
      lines.push(cleaned);
    }
  }

  return lines;
}

/**
 * Build lines for a specific page from text items.
 * 
 * @param items - All text items from the PDF
 * @param pageNumber - The page number to extract (1-indexed)
 * @returns Array of lines for that page
 */
export function buildLinesForPage(items: TextItem[], pageNumber: number): string[] {
  const pageItems = items.filter(item => item.page === pageNumber);
  return buildLinesFromItems(pageItems);
}
