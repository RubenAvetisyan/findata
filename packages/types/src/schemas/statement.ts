import { z } from 'zod';

export const AccountTypeSchema = z.enum(['checking', 'savings', 'credit']);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const TransactionDirectionSchema = z.enum(['debit', 'credit']);
export type TransactionDirection = z.infer<typeof TransactionDirectionSchema>;

export const StatementPeriodSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});
export type StatementPeriod = z.infer<typeof StatementPeriodSchema>;

export const AccountSchema = z.object({
  institution: z.literal('Bank of America'),
  accountType: AccountTypeSchema,
  accountNumberMasked: z.string().regex(/^\*{4}\d{4}$/, 'Must be in format ****1234'),
  statementPeriod: StatementPeriodSchema,
  currency: z.literal('USD'),
});
export type Account = z.infer<typeof AccountSchema>;

export const SummarySchema = z.object({
  startingBalance: z.number(),
  endingBalance: z.number(),
  totalCredits: z.number(),
  totalDebits: z.number(),
});
export type Summary = z.infer<typeof SummarySchema>;

export const RawTransactionDataSchema = z.object({
  originalText: z.string(),
  page: z.number().int().positive(),
});
export type RawTransactionData = z.infer<typeof RawTransactionDataSchema>;

export const TransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  postedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .nullable(),
  description: z.string().min(1),
  merchant: z.string().nullable(),
  amount: z.number(),
  direction: TransactionDirectionSchema,
  category: z.string().min(1),
  subcategory: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  raw: RawTransactionDataSchema,
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const MetadataSchema = z.object({
  parserVersion: z.string(),
  parsedAt: z.string().datetime(),
  warnings: z.array(z.string()),
});
export type Metadata = z.infer<typeof MetadataSchema>;

export const ParsedStatementSchema = z.object({
  account: AccountSchema,
  summary: SummarySchema,
  transactions: z.array(TransactionSchema),
  metadata: MetadataSchema,
});
export type ParsedStatement = z.infer<typeof ParsedStatementSchema>;

export const ParserOptionsSchema = z.object({
  strict: z.boolean().default(false),
  verbose: z.boolean().default(false),
});
export type ParserOptions = z.infer<typeof ParserOptionsSchema>;
