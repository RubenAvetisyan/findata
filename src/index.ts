// ─── Extractors ─────────────────────────────────────────────────────────────
export { extractPDF, findLinesByPattern, extractTextBetweenMarkers } from './extractors/index.js';
export { extractTextItems, extractTextItemsFromBuffer } from './extractors/index.js';
export type { ExtractedPage, ExtractedPDF, TextItem, LayoutExtractedPDF } from './extractors/index.js';

// ─── Parsers ────────────────────────────────────────────────────────────────
export {
  parseBoaStatement,
  parseBoaMultipleStatements,
  detectAccountType,
  isTransactionDetailsPDF,
  parseTransactionDetails,
} from './parsers/index.js';
export type { ParseResult, MultiStatementParseResult, RawTransaction, AccountInfo, BalanceInfo } from './parsers/index.js';

// ─── Categorization ─────────────────────────────────────────────────────────
export {
  categorizeTransaction,
  extractMerchant,
  CATEGORY_RULES,
  DEFAULT_CATEGORY,
  CATEGORY_RULES_V2,
  getCategoryRuleById,
  getRulesByCategory,
  HybridCategorizer,
  categorizeWithRulesOnly,
  MLCategorizer,
  generateTrainingData,
  generateFromParsedTransactions,
} from './categorization/index.js';
export type {
  CategoryRule,
  CategorizationResult,
  HybridCategorizationResult,
  HybridCategorizerConfig,
  MLCategorizationResult,
  TrainingExample,
} from './categorization/index.js';

// ─── Normalizers ────────────────────────────────────────────────────────────
export {
  sortTransactionsByDate,
  deduplicateTransactions,
  filterTransactionsByDateRange,
  groupTransactionsByCategory,
  calculateCategoryTotals,
} from './normalizers/index.js';

// ─── Schemas ────────────────────────────────────────────────────────────────
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

// ─── Utils ──────────────────────────────────────────────────────────────────
export { PARSER_VERSION, BOA_INSTITUTION_NAME } from './utils/index.js';

// ─── Output (adapters, analytics, export formats, recurring detection) ──────
export {
  toFinalResultV1,
  toFinalResultV2,
  toFinalResult,
  generateAnalytics,
  checkIntegrity,
  exportOfx,
  exportAccountOfx,
  exportOfxByAccount,
  exportCsv,
  exportAccountCsv,
  exportCsvByAccount,
  detectRecurring,
  detectRecurringFromStatements,
  getRecurringFlags,
  enrichWithPlaid,
} from './output/index.js';
export type {
  CanonicalOutput,
  FinalResultV1,
  FinalResultV2,
  AnalyticsResult,
  IntegrityCheckResult,
  OfxExportOptions,
  CsvExportOptions,
  RecurringDetectionResult,
  RecurringDetectionOptions,
  RecurringPattern,
  RecurringSummary,
  EnrichOptions,
  EnrichResult,
} from './output/index.js';

// ─── Validation ─────────────────────────────────────────────────────────────
export {
  validateOutput,
  validateAndThrow,
  formatValidationErrors,
  validateReconciliation,
  validateStatementReconciliation,
  formatReconciliationResult,
} from './validation/index.js';
export type {
  ValidationResult,
  ValidationError,
} from './validation/index.js';
export type { ReconciliationResult as BalanceReconciliationResult, ReconciliationOptions } from './validation/index.js';

// ─── Layout ─────────────────────────────────────────────────────────────────
export {
  groupByRows,
  mergeWrappedDescriptions,
  detectColumnsFromHeader,
  detectBoaTransactionColumns,
  extractBoaTransactionFromRow,
} from './layout/index.js';
export type { Row, Column, ColumnMapping } from './layout/index.js';

// ─── Plaid Integration ──────────────────────────────────────────────────────
export {
  createPlaidClient,
  isPlaidConfigured,
  testPlaidConnection,
  createLinkToken,
  exchangePublicToken,
  removeItem,
  syncTransactions,
  syncAllTransactions,
  syncItemTransactions,
  getTransactionsByDateRange,
  reconcileTransactions,
  formatReconciliationReport,
  createSyncService,
  PlaidSyncService,
  createWebhookHandler,
  mergePlaidData,
  formatMergeReport,
  runUnifiedSync,
  FilePlaidItemStore,
  getFilePlaidItemStore,
  getIdentity,
  getAuth,
  getLiabilities,
  getHoldings,
} from './plaid/index.js';
export type {
  PlaidConfig,
  PlaidItem,
  PlaidAccount,
  PlaidTransaction,
  PlaidSyncResult,
  ReconciliationMatch,
  ReconciliationResult as PlaidReconciliationResult,
  ReconcileOptions,
  SyncServiceConfig,
  SyncResult,
  SyncProgressEvent,
  WebhookHandlers,
  UnifiedSyncOptions,
  UnifiedSyncResult,
  MergeResult,
  MergeStats,
} from './plaid/index.js';

// ─── Supabase Integration ───────────────────────────────────────────────────
export {
  createSupabaseClient,
  isSupabaseConfigured,
  importV2Result,
  upsertAccount,
  upsertTransactions,
  getTransactions as getSupabaseTransactions,
  getStatements as getSupabaseStatements,
  getAccountSummary,
  getMonthlyCategoryTotals,
  getMerchantSpending,
  getTransactionsNeedingReview,
  setTransactionOverride,
  deleteTransactionOverride,
  runMigrations,
  needsMigration,
} from './supabase/index.js';
export type {
  SupabaseConfig,
  ImportV2ResultInput,
  ImportV2ResultOutput,
  TransactionFilter,
  TransactionRow,
  SetTransactionOverrideInput,
} from './supabase/index.js';

// ─── Convenience ────────────────────────────────────────────────────────────
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
