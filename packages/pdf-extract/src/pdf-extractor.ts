import { extractTextItemsFromBuffer, buildLinesForPage } from './layout-pdfjs.js';
import { readFile } from 'fs/promises';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  lines: string[];
}

export interface ExtractedPDF {
  pages: ExtractedPage[];
  fullText: string;
  totalPages: number;
  metadata: {
    title?: string | undefined;
    author?: string | undefined;
    creationDate?: string | undefined;
  };
}

/**
 * Extract PDF using layout-aware pdfjs-dist extraction.
 * This properly handles column gaps to prevent text from being "glued" together.
 */
export async function extractPDF(filePath: string): Promise<ExtractedPDF> {
  const dataBuffer = await readFile(filePath);
  const layoutResult = await extractTextItemsFromBuffer(new Uint8Array(dataBuffer));

  // Build pages using layout-aware line reconstruction
  const pages: ExtractedPage[] = [];
  for (let pageNum = 1; pageNum <= layoutResult.totalPages; pageNum++) {
    const lines = buildLinesForPage(layoutResult.items, pageNum);
    const text = lines.join('\n');
    pages.push({
      pageNumber: pageNum,
      text,
      lines,
    });
  }

  const fullText = pages.map(p => p.text).join('\n\n');

  return {
    pages,
    fullText,
    totalPages: layoutResult.totalPages,
    metadata: layoutResult.metadata,
  };
}

export function findLinesByPattern(pages: ExtractedPage[], pattern: RegExp): Array<{
  line: string;
  pageNumber: number;
  lineIndex: number;
}> {
  const results: Array<{ line: string; pageNumber: number; lineIndex: number }> = [];

  for (const page of pages) {
    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i];
      if (line !== undefined && pattern.test(line)) {
        results.push({
          line,
          pageNumber: page.pageNumber,
          lineIndex: i,
        });
      }
    }
  }

  return results;
}

export function extractTextBetweenMarkers(
  text: string,
  startMarker: RegExp,
  endMarker: RegExp
): string | null {
  const startMatch = startMarker.exec(text);
  if (startMatch === null) return null;

  const startIndex = startMatch.index + startMatch[0].length;
  const remainingText = text.slice(startIndex);

  const endMatch = endMarker.exec(remainingText);
  if (endMatch === null) return remainingText.trim();

  return remainingText.slice(0, endMatch.index).trim();
}
