export {
  AccountTypeSchema,
  TransactionDirectionSchema,
  StatementPeriodSchema,
  AccountSchema,
  SummarySchema,
  RawTransactionDataSchema,
  TransactionSchema,
  MetadataSchema,
  ParsedStatementSchema,
  ParserOptionsSchema,
} from './statement.js';

// Re-export Zod-inferred types under aliased names to avoid
// collisions with canonical output.ts types (AccountType, Transaction, etc.)
export type {
  AccountType as ZodAccountType,
  TransactionDirection,
  StatementPeriod,
  Account as ZodAccount,
  Summary as ZodSummary,
  RawTransactionData,
  Transaction as ZodTransaction,
  Metadata,
  ParsedStatement,
  ParserOptions,
} from './statement.js';

export {
  getSchemaPath,
  getSchema,
  isValidSchemaVersion,
  assertValidSchemaVersion,
  validateOutput as validateSchemaOutput,
  validateOutputOrThrow,
  resolveSchemaVersion,
  AVAILABLE_SCHEMA_VERSIONS,
  DEFAULT_SCHEMA_VERSION,
} from './schema-registry.js';

export type {
  SchemaVersion,
  ValidationResult as SchemaValidationResult,
  ValidationError as SchemaValidationError,
} from './schema-registry.js';
