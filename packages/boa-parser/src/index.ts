// Parser exports
export {
  parseBoaStatement,
  parseBoaMultipleStatements,
  detectAccountType,
  parseCheckingStatement,
  parseMultipleCheckingStatements,
  parseSavingsStatement,
  parseMultipleSavingsStatements,
  parseCreditStatement,
  isTransactionDetailsPDF,
  parseTransactionDetails,
} from './boa/index.js';

export type { ParseResult, MultiStatementParseResult, RawTransaction, AccountInfo, BalanceInfo, ParseContext } from './boa/index.js';

// Normalizers
export {
  sortTransactionsByDate,
  deduplicateTransactions,
  filterTransactionsByDateRange,
  groupTransactionsByCategory,
  calculateCategoryTotals,
} from './normalizers/index.js';

// Channel extractor
export { extractChannelAndReference, extractChannel, extractBankReference } from './boa/channel-extractor.js';

// Merchant extractor
export { extractMerchant as extractMerchantV2 } from './boa/merchant-extractor.js';

// Transaction normalizer (v2)
export { normalizeTransaction, type NormalizationContext } from './boa/transaction-normalizer.js';

// Line merger
export { mergeWrappedLines, parseTransactionLines } from './boa/line-merger.js';

// Layout parser
export { parseWithLayout, type LayoutParserConfig } from './boa/layout-parser.js';

// Batch processor
export {
  processBatch,
  type ParseError,
  type BatchProcessResult,
  type BatchProcessOptions,
} from './batch-processor.js';

// Directory scanner
export {
  scanDirectoryForPdfs,
  validateDirectory,
  type PdfFileInfo,
  type ScanResult,
} from './directory-scanner.js';

// Statement merger
export {
  mergeStatementsWithSources,
  mergeStatements,
  isCombinedPdfFilename,
  getStatementKey,
  getTransactionKey,
  calculateCompletenessScore,
  resolveStatementDuplicate,
  recalculateSummary,
  type MergeResult,
  type StatementWithSource,
} from './statement-merger.js';
