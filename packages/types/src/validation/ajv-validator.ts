/**
 * AJV-based JSON Schema validation for parser output.
 * Uses Draft 2020-12 as specified in the schema.
 */

import Ajv from 'ajv';
import ajvFormats from 'ajv-formats';
import type { StatementFileOutput } from '../types/output.js';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
const addFormats = (ajvFormats as any).default ?? ajvFormats;

interface AjvErrorObject {
  instancePath: string;
  message?: string;
  keyword: string;
  params: Record<string, unknown>;
}

interface AjvValidateFunction {
  (data: unknown): boolean;
  errors?: AjvErrorObject[] | null;
}

const SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://example.local/schemas/boa-statement-output.schema.json",
  "title": "Bank of America Statement Parse Output",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "source", "statements", "metadata"],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": ["fileName", "fileType"],
      "properties": {
        "fileName": { "type": "string", "minLength": 1 },
        "fileType": { "const": "pdf" },
        "checksumSha256": { "type": "string", "pattern": "^[a-fA-F0-9]{64}$" },
        "pageCount": { "type": "integer", "minimum": 1 }
      }
    },
    "statements": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/statement" }
    },
    "metadata": {
      "type": "object",
      "additionalProperties": false,
      "required": ["parser", "parsedAt", "warnings"],
      "properties": {
        "parser": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "version"],
          "properties": {
            "name": { "type": "string", "minLength": 1 },
            "version": { "type": "string", "minLength": 1 },
            "build": { "type": "string" }
          }
        },
        "parsedAt": { "type": "string", "format": "date-time" },
        "warnings": { "type": "array", "items": { "type": "string" } },
        "notes": { "type": "array", "items": { "type": "string" } }
      }
    }
  },
  "$defs": {
    "isoDate": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "statement": {
      "type": "object",
      "additionalProperties": false,
      "required": ["statementId", "account", "summary", "transactions", "provenance"],
      "properties": {
        "statementId": { "type": "string", "minLength": 16 },
        "account": {
          "type": "object",
          "additionalProperties": false,
          "required": ["institution", "accountType", "accountNumberMasked", "statementPeriod", "currency"],
          "properties": {
            "institution": { "const": "Bank of America" },
            "productName": { "type": "string" },
            "accountType": { "enum": ["checking", "credit"] },
            "accountNumberMasked": { "type": "string", "minLength": 4 },
            "currency": { "const": "USD" },
            "statementCycle": { "type": "string" },
            "statementPeriod": {
              "type": "object",
              "additionalProperties": false,
              "required": ["start", "end"],
              "properties": {
                "start": { "$ref": "#/$defs/isoDate" },
                "end": { "$ref": "#/$defs/isoDate" }
              }
            }
          }
        },
        "summary": {
          "type": "object",
          "additionalProperties": false,
          "required": ["beginningBalance", "endingBalance", "totalCredits", "totalDebits", "transactionCount"],
          "properties": {
            "beginningBalance": { "type": "number" },
            "endingBalance": { "type": "number" },
            "depositsAndOtherAdditions": { "type": "number" },
            "atmAndDebitCardSubtractions": { "type": "number" },
            "otherSubtractions": { "type": "number" },
            "checksTotal": { "type": "number" },
            "serviceFeesTotal": { "type": "number" },
            "totalCredits": { "type": "number", "minimum": 0 },
            "totalDebits": { "type": "number", "minimum": 0 },
            "transactionCount": { "type": "integer", "minimum": 0 }
          }
        },
        "sections": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "deposits": { "$ref": "#/$defs/sectionTotals" },
            "atmAndDebitCard": { "$ref": "#/$defs/sectionTotals" },
            "otherSubtractions": { "$ref": "#/$defs/sectionTotals" },
            "checks": { "$ref": "#/$defs/sectionTotals" },
            "serviceFees": { "$ref": "#/$defs/sectionTotals" }
          }
        },
        "transactions": {
          "type": "array",
          "items": { "$ref": "#/$defs/transaction" }
        },
        "provenance": {
          "type": "object",
          "additionalProperties": false,
          "required": ["extractedFromText"],
          "properties": {
            "pageStart": { "type": "integer", "minimum": 1 },
            "pageEnd": { "type": "integer", "minimum": 1 },
            "extractedFromText": { "type": "boolean" }
          }
        }
      }
    },
    "sectionTotals": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "total": { "type": "number" },
        "count": { "type": "integer", "minimum": 0 },
        "rawTotalLine": { "type": "string" }
      }
    },
    "transaction": {
      "type": "object",
      "additionalProperties": false,
      "required": ["transactionId", "date", "postedDate", "amount", "direction", "description", "descriptionRaw", "merchant", "bankReference", "channel", "categorization", "raw"],
      "properties": {
        "transactionId": { "type": "string", "minLength": 16 },
        "date": { "$ref": "#/$defs/isoDate" },
        "postedDate": { "anyOf": [{ "$ref": "#/$defs/isoDate" }, { "type": "null" }] },
        "amount": { "type": "number" },
        "direction": { "enum": ["debit", "credit"] },
        "description": { "type": "string", "minLength": 1 },
        "descriptionRaw": { "type": "string", "minLength": 1 },
        "merchant": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name"],
          "properties": {
            "name": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "normalizedName": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "city": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "state": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "phone": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "online": { "anyOf": [{ "type": "boolean" }, { "type": "null" }] },
            "network": { "anyOf": [{ "enum": ["VISA", "MASTERCARD", "AMEX", "DISCOVER"] }, { "type": "null" }] }
          }
        },
        "bankReference": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "cardTransactionTraceNumber": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "confirmationNumber": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "zelleConfirmation": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "checkNumber": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "atmId": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "terminalOrStoreId": { "anyOf": [{ "type": "string" }, { "type": "null" }] }
          }
        },
        "channel": {
          "type": "object",
          "additionalProperties": false,
          "required": ["type"],
          "properties": {
            "type": {
              "enum": [
                "CHECKCARD",
                "PURCHASE",
                "ATM_DEPOSIT",
                "ATM_WITHDRAWAL",
                "FINANCIAL_CENTER_DEPOSIT",
                "ONLINE_BANKING_TRANSFER",
                "ZELLE",
                "CHECK",
                "FEE",
                "OTHER"
              ]
            },
            "subtype": { "anyOf": [{ "type": "string" }, { "type": "null" }] }
          }
        },
        "categorization": {
          "type": "object",
          "additionalProperties": false,
          "required": ["category", "subcategory", "confidence"],
          "properties": {
            "category": {
              "enum": [
                "Income", "Housing", "Utilities", "Transportation", "Food & Dining", "Shopping",
                "Entertainment", "Health", "Financial", "Travel", "Education", "Personal Care",
                "Insurance", "Taxes", "Charity", "Pets", "Childcare", "Uncategorized"
              ]
            },
            "subcategory": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
            "ruleId": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
            "rationale": { "anyOf": [{ "type": "string" }, { "type": "null" }] }
          }
        },
        "raw": {
          "type": "object",
          "additionalProperties": false,
          "required": ["page", "originalText"],
          "properties": {
            "page": { "type": "integer", "minimum": 1 },
            "lineIndex": { "type": "integer", "minimum": 0 },
            "section": {
              "anyOf": [
                { "enum": ["deposits", "atm_debit", "other_subtractions", "checks", "service_fees"] },
                { "type": "null" }
              ]
            },
            "originalText": { "type": "string", "minLength": 1 }
          }
        },
        "flags": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "isRecurring": { "type": "boolean" },
            "isSubscription": { "type": "boolean" },
            "isTransfer": { "type": "boolean" },
            "isCashWithdrawal": { "type": "boolean" },
            "isCashDeposit": { "type": "boolean" },
            "possibleDuplicate": { "type": "boolean" }
          }
        }
      }
    }
  }
};

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
}

let compiledValidator: AjvValidateFunction | null = null;

function getValidator(): AjvValidateFunction {
  if (compiledValidator === null) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const ajv = new (Ajv as unknown as new (opts: object) => { compile: (schema: object) => AjvValidateFunction })({
      allErrors: true,
      verbose: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    addFormats(ajv);
    compiledValidator = ajv.compile(SCHEMA);
  }
  return compiledValidator;
}

export function validateOutput(output: unknown): ValidationResult {
  const validate = getValidator();
  const valid = validate(output);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const rawErrors = validate.errors ?? [];
  const errors: ValidationError[] = rawErrors.map((err) => ({
    path: err.instancePath || '/',
    message: err.message ?? 'Unknown validation error',
    keyword: err.keyword,
    params: err.params,
  }));

  return { valid: false, errors };
}

export function validateAndThrow(output: unknown): asserts output is StatementFileOutput {
  const result = validateOutput(output);
  if (!result.valid) {
    const errorMessages = result.errors
      .slice(0, 10)
      .map((e) => `  ${e.path}: ${e.message}`)
      .join('\n');
    throw new Error(`Schema validation failed:\n${errorMessages}`);
  }
}

export function formatValidationErrors(errors: ValidationError[]): string[] {
  return errors.map((e) => `[${e.keyword}] ${e.path}: ${e.message}`);
}
