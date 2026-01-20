/**
 * Line merger for handling wrapped/continuation lines in PDF text extraction.
 * Merges multi-line descriptions into single logical transactions.
 */

import type { ParsedLine, SectionType } from '../../types/output.js';

const DATE_PATTERN = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s*/;
const AMOUNT_PATTERN = /(-?[0-9,]+\.\d{2})$/;
const CONTINUATION_INDICATORS = [
  /^\s{4,}/,
  /^[a-z]/,
  /^[A-Z]{2,}\s+[A-Z]{2}\s*$/,
];

export interface RawLine {
  text: string;
  page: number;
  lineIndex: number;
}

export function mergeWrappedLines(
  lines: RawLine[],
  section: SectionType
): ParsedLine[] {
  const result: ParsedLine[] = [];
  let currentTransaction: ParsedLine | null = null;
  let accumulatedText: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const text = line.text.trim();
    if (text === '') continue;

    const hasDate = DATE_PATTERN.test(text);
    const hasAmount = AMOUNT_PATTERN.test(text);

    if (hasDate) {
      if (currentTransaction !== null) {
        currentTransaction.description = accumulatedText.join(' ').trim();
        currentTransaction.originalText = accumulatedText.join('\n');
        result.push(currentTransaction);
      }

      const dateMatch = DATE_PATTERN.exec(text);
      const amountMatch = AMOUNT_PATTERN.exec(text);
      
      const dateStr = dateMatch?.[1] ?? '';
      const amount = amountMatch?.[1] ?? '';
      
      let description = text;
      if (dateMatch !== null) {
        description = description.slice(dateMatch[0].length);
      }
      if (amountMatch !== null) {
        description = description.slice(0, -amountMatch[0].length);
      }
      description = description.trim();

      currentTransaction = {
        date: dateStr,
        description,
        amount,
        page: line.page,
        lineIndex: line.lineIndex,
        originalText: text,
        section,
        isContinuation: false,
      };
      accumulatedText = [text];
    } else if (currentTransaction !== null && isContinuationLine(text)) {
      accumulatedText.push(text);
      
      if (!hasAmount && AMOUNT_PATTERN.test(text)) {
        const amountMatch = AMOUNT_PATTERN.exec(text);
        if (amountMatch?.[1] !== undefined) {
          currentTransaction.amount = amountMatch[1];
        }
      }
    } else if (hasAmount && currentTransaction !== null) {
      const amountMatch = AMOUNT_PATTERN.exec(text);
      if (amountMatch?.[1] !== undefined) {
        currentTransaction.amount = amountMatch[1];
        const descPart = text.slice(0, -amountMatch[0].length).trim();
        if (descPart !== '') {
          accumulatedText.push(descPart);
        }
      }
    }
  }

  if (currentTransaction !== null) {
    currentTransaction.description = accumulatedText.join(' ').trim();
    currentTransaction.originalText = accumulatedText.join('\n');
    result.push(currentTransaction);
  }

  return result;
}

function isContinuationLine(text: string): boolean {
  if (DATE_PATTERN.test(text)) {
    return false;
  }
  
  for (const pattern of CONTINUATION_INDICATORS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  if (/^[A-Z0-9]/.test(text) && !DATE_PATTERN.test(text) && text.length < 60) {
    return true;
  }
  
  return false;
}

export function parseTransactionLines(
  lines: string[],
  page: number,
  section: SectionType
): ParsedLine[] {
  const rawLines: RawLine[] = lines.map((text, index) => ({
    text,
    page,
    lineIndex: index,
  }));
  
  return mergeWrappedLines(rawLines, section);
}
