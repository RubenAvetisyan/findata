export { extractPDF, findLinesByPattern, extractTextBetweenMarkers } from './extractors/index.js';
export type { ExtractedPage, ExtractedPDF } from './extractors/index.js';

export { parseBoaStatement, detectAccountType } from './parsers/index.js';
export type { ParseResult } from './parsers/index.js';

export {
  categorizeTransaction,
  extractMerchant,
  CATEGORY_RULES,
  DEFAULT_CATEGORY,
} from './categorization/index.js';
export type { CategoryRule, CategorizationResult } from './categorization/index.js';

export {
  sortTransactionsByDate,
  deduplicateTransactions,
  filterTransactionsByDateRange,
  groupTransactionsByCategory,
  calculateCategoryTotals,
} from './normalizers/index.js';

export {
  ParsedStatementSchema,
  TransactionSchema,
  AccountSchema,
  SummarySchema,
  MetadataSchema,
} from './schemas/index.js';
export type {
  ParsedStatement,
  Transaction,
  Account,
  Summary,
  Metadata,
  AccountType,
  TransactionDirection,
  ParserOptions,
} from './schemas/index.js';

export { PARSER_VERSION, BOA_INSTITUTION_NAME } from './utils/index.js';

export async function parseStatementFile(
  filePath: string,
  options: { strict?: boolean; verbose?: boolean } = {}
): Promise<import('./parsers/index.js').ParseResult> {
  const { extractPDF } = await import('./extractors/index.js');
  const { parseBoaStatement } = await import('./parsers/index.js');

  const pdf = await extractPDF(filePath);
  return parseBoaStatement(pdf, {
    strict: options.strict ?? false,
    verbose: options.verbose ?? false,
  });
}
