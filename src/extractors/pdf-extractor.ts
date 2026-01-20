import pdf from 'pdf-parse';
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

export async function extractPDF(filePath: string): Promise<ExtractedPDF> {
  const dataBuffer = await readFile(filePath);
  const data = await pdf(dataBuffer);

  const pages = splitIntoPages(data.text, data.numpages);

  const info = data.info as Record<string, unknown> | undefined;
  
  return {
    pages,
    fullText: data.text,
    totalPages: data.numpages,
    metadata: {
      title: typeof info?.['Title'] === 'string' ? info['Title'] : undefined,
      author: typeof info?.['Author'] === 'string' ? info['Author'] : undefined,
      creationDate: typeof info?.['CreationDate'] === 'string' ? info['CreationDate'] : undefined,
    },
  };
}

function splitIntoPages(fullText: string, numPages: number): ExtractedPage[] {
  const pageMarkers = fullText.split(/(?=Page \d+ of \d+)/);

  if (pageMarkers.length > 1) {
    return pageMarkers.map((text, index) => ({
      pageNumber: index + 1,
      text: text.trim(),
      lines: text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0),
    }));
  }

  const lines = fullText.split('\n');
  const linesPerPage = Math.ceil(lines.length / numPages);
  const pages: ExtractedPage[] = [];

  for (let i = 0; i < numPages; i++) {
    const startLine = i * linesPerPage;
    const endLine = Math.min(startLine + linesPerPage, lines.length);
    const pageLines = lines.slice(startLine, endLine);
    const pageText = pageLines.join('\n');

    pages.push({
      pageNumber: i + 1,
      text: pageText.trim(),
      lines: pageLines.map((line) => line.trim()).filter((line) => line.length > 0),
    });
  }

  return pages;
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
