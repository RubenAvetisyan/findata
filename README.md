# boa-statement-parser

A production-ready Node.js library and CLI for parsing Bank of America bank statement PDFs into clean, normalized, categorized JSON with full JSON Schema validation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Multi-format support**: Parses both checking and credit card statements
- **Multi-statement PDFs**: Extracts multiple statements from combined PDF files
- **Batch directory processing**: Process entire directories of PDFs with `--inputDir`
- **Smart deduplication**: Statement-level and transaction-level dedup with completeness scoring
- **Automatic detection**: Identifies account type from statement content
- **Transaction categorization**: 70+ priority-ordered rules with confidence tiers
- **Channel detection**: Identifies CHECKCARD, ATM, Zelle, Online Banking transfers, etc.
- **Bank reference extraction**: Captures confirmation numbers, trace numbers, ATM IDs
- **Merchant extraction**: Extracts merchant name, city, state, and online flag
- **JSON Schema validation**: AJV-based validation against Draft 2020-12 schema
- **Wrapped line handling**: Merges multi-line descriptions from PDF extraction
- **Strict validation**: Optional schema validation with Zod
- **Idempotent output**: Same input always produces same output
- **TypeScript-first**: Full type safety with strict mode

## Installation

```bash
# Using pnpm (recommended)
pnpm install

# Using npm
npm install
```

## Quick Start

### CLI Usage

```bash
# Parse a single statement PDF
pnpm parse-boa ./statement.pdf

# Save output to a file
pnpm parse-boa ./statement.pdf --out result.json

# Enable verbose mode for debugging
pnpm parse-boa ./statement.pdf --verbose

# Enable strict validation
pnpm parse-boa ./statement.pdf --strict

# Compact JSON output (no pretty-printing)
pnpm parse-boa ./statement.pdf --no-pretty
```

### Batch Directory Processing

Process multiple PDF files from a directory:

```bash
# Process all PDFs in a directory
pnpm parse-boa --inputDir "C:\Users\...\Statements" --out result.json

# With verbose output showing progress
pnpm parse-boa --inputDir ./statements --out result.json --verbose

# With strict validation
pnpm parse-boa --inputDir ./statements --out result.json --strict --verbose
```

Batch processing features:
- Scans directory for `*.pdf` files (case-insensitive)
- Skips temporary files (`~$...`) and zero-byte files
- Processes files in deterministic order (sorted by filename)
- Deduplicates statements across all PDFs
- Produces single consolidated output matching single-PDF schema

### Programmatic Usage

```typescript
import { parseStatementFile } from 'boa-statement-parser';

const result = await parseStatementFile('./statement.pdf', {
  strict: true,
  verbose: false,
});

console.log(result.statement.transactions);
```

### Advanced Usage

```typescript
import { extractPDF, parseBoaStatement, detectAccountType } from 'boa-statement-parser';

// Extract PDF content
const pdf = await extractPDF('./statement.pdf');

// Detect account type
const accountType = detectAccountType(pdf);
console.log(`Detected: ${accountType}`); // 'checking' | 'credit' | 'unknown'

// Parse with options
const result = parseBoaStatement(pdf, {
  strict: true,
  verbose: true,
});

// Access parsed data
console.log(result.statement.account);
console.log(result.statement.summary);
console.log(result.statement.transactions);
console.log(result.statement.metadata.warnings);
```

## Output JSON Schema

The output conforms to JSON Schema Draft 2020-12. See `JSON_SCHEMA.json` for the full schema.

```typescript
{
  "schemaVersion": "1.0.0",
  "source": {
    "fileName": "statement.pdf",
    "fileType": "pdf",
    "pageCount": 4
  },
  "statements": [{
    "statementId": "sha256-hash-32-chars",
    "account": {
      "institution": "Bank of America",
      "accountType": "checking" | "credit",
      "accountNumberMasked": "****1234",
      "currency": "USD",
      "statementPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }
    },
    "summary": {
      "beginningBalance": number,
      "endingBalance": number,
      "totalCredits": number,
      "totalDebits": number,
      "transactionCount": number
    },
    "transactions": [{
      "transactionId": "sha256-hash-32-chars",
      "date": "YYYY-MM-DD",
      "postedDate": "YYYY-MM-DD" | null,
      "amount": number,
      "direction": "debit" | "credit",
      "description": "cleaned description",
      "descriptionRaw": "original line from PDF",
      "merchant": {
        "name": "STARBUCKS",
        "normalizedName": "Starbucks",
        "city": "SEATTLE",
        "state": "WA",
        "online": false,
        "network": "VISA" | null
      },
      "bankReference": {
        "cardTransactionTraceNumber": "24801975260482319110911",
        "confirmationNumber": "1234567890",
        "zelleConfirmation": "T0ZDL3WND",
        "atmId": "000009733",
        "checkNumber": "1234"
      },
      "channel": {
        "type": "CHECKCARD" | "ATM_DEPOSIT" | "ATM_WITHDRAWAL" | "ZELLE" | 
               "ONLINE_BANKING_TRANSFER" | "CHECK" | "FEE" | "OTHER",
        "subtype": "transfer_from_sav" | null
      },
      "categorization": {
        "category": "Food & Dining",
        "subcategory": "Restaurants",
        "confidence": 0.85,
        "ruleId": "food-restaurant",
        "rationale": "Matched rule: food-restaurant"
      },
      "raw": {
        "page": 1,
        "section": "deposits" | "atm_debit" | "checks" | "service_fees" | null,
        "originalText": "01/05 STARBUCKS STORE 12345 5.75"
      },
      "flags": {
        "isTransfer": true,
        "isSubscription": false
      }
    }],
    "provenance": {
      "extractedFromText": true,
      "pageStart": 1,
      "pageEnd": 4
    }
  }],
  "metadata": {
    "parser": { "name": "boa-statement-parser", "version": "1.0.0" },
    "parsedAt": "2024-01-15T10:30:00.000Z",
    "warnings": []
  }
}
```

## Channel Types

The parser detects and classifies transaction channels:

| Channel Type | Description | Example |
|--------------|-------------|---------|
| `CHECKCARD` | Debit card purchases | `CHECKCARD 0105 STARBUCKS...` |
| `ATM_DEPOSIT` | ATM cash/check deposits | `BKOFAMERICA ATM #000009733 DEPOSIT` |
| `ATM_WITHDRAWAL` | ATM cash withdrawals | `BKOFAMERICA ATM WITHDRWL` |
| `ONLINE_BANKING_TRANSFER` | Online transfers | `Online Banking transfer from SAV Confirmation#...` |
| `ZELLE` | Zelle payments | `Zelle payment from JOHN DOE Conf#...` |
| `CHECK` | Check payments | Check number extracted |
| `FEE` | Bank fees | `Monthly Maintenance Fee` |
| `FINANCIAL_CENTER_DEPOSIT` | Branch deposits | `FINANCIAL CENTER DEPOSIT` |
| `OTHER` | Unclassified | Fallback |

## Confidence Tiers

Categorization uses three confidence levels:

| Tier | Confidence | Description |
|------|------------|-------------|
| HIGH | 0.95 | Exact merchant match (Netflix, Uber, etc.) |
| MEDIUM | 0.75-0.85 | Keyword match with context |
| LOW | 0.50 | Uncategorized (no rule matched) |

## Transaction Categories

The parser includes 70+ priority-ordered categorization rules covering:

| Category | Subcategories |
|----------|---------------|
| Income | Salary, Interest, Dividends, Refund |
| Housing | Rent, Mortgage, HOA, Property Tax |
| Utilities | Electric, Gas, Water, Internet, Phone |
| Transportation | Rideshare, Gas, Parking, Tolls, Insurance |
| Food & Dining | Groceries, Restaurants, Food Delivery, Alcohol |
| Shopping | Online, General Merchandise, Electronics, Clothing |
| Entertainment | Streaming, Movies, Events, Fitness, Gaming |
| Health | Pharmacy, Medical, Dental, Vision, Insurance |
| Financial | ATM, Deposit, Check, Credit Card Payment, Investment, Loan Payment |
| Transfer | Zelle, Venmo, Internal, Wire, ACH |
| Fees | Bank |
| Travel | Flights, Lodging, Car Rental |
| Education | Tuition, Learning |
| Personal Care | Grooming, Beauty |
| Insurance | Life, Renters |
| Taxes | Tax Payment, Tax Preparation |
| Charity | Donation |
| Pets | Pet Care |
| Childcare | Daycare |

Uncategorized transactions receive a confidence score of 0.5.

## CLI Options

| Option | Description |
|--------|-------------|
| `-d, --inputDir <dir>` | Directory containing PDF files to batch process |
| `-o, --out <file>` | Output file path (default: stdout) |
| `-v, --verbose` | Enable verbose output with debug info |
| `-s, --strict` | Enable strict validation mode |
| `--pretty` | Pretty-print JSON output (default: true) |
| `--no-pretty` | Disable pretty-printing |
| `--single` | Parse as single statement (legacy mode) |
| `--schema-version <v1\|v2>` | Output schema version (default: v1) |
| `--version` | Show version number |
| `--help` | Show help |

## Output Schema Versioning

The parser supports multiple output schema versions for backwards compatibility and new features.

### Selecting Schema Version

Schema version is resolved with the following precedence (highest to lowest):

1. **CLI flag**: `--schema-version v1` or `--schema-version v2`
2. **Environment variable**: `FINAL_RESULT_SCHEMA_VERSION=v2`
3. **Default**: `v1`

### Schema v1 (Default)

The original output format with a flat array of statements:

```json
{
  "schemaVersion": "v1",
  "statements": [
    {
      "account": { "institution": "Bank of America", "accountType": "checking", ... },
      "summary": { "startingBalance": 100, "endingBalance": 200, ... },
      "transactions": [...],
      "metadata": { "parserVersion": "1.0.0", "parsedAt": "...", "warnings": [] }
    }
  ],
  "totalStatements": 1,
  "totalTransactions": 5
}
```

### Schema v2 (BOFA Rollup)

A new rollup format that groups transactions by account with aggregated totals, analytics, and integrity checks:

```json
{
  "schemaVersion": "v2",
  "startingBalance": 100,
  "endingBalance": 500,
  "totalStatements": 3,
  "totalTransactions": 50,
  "analytics": {
    "quarterlyCashFlow": [...],
    "incomeVsExpenses": { "totalIncome": 5000, "totalExpenses": 4500, "netIncome": 500, ... },
    "lenderSummary": { "averageMonthlyIncome": 2500, "incomeStabilityScore": 85, ... },
    "taxPreparation": { "taxYear": 2025, "totalTaxableIncome": 30000, ... }
  },
  "integrity": {
    "overallValid": true,
    "statementsChecked": 3,
    "statementsWithIssues": 0,
    "statementResults": [...],
    "summary": { "totalDiscrepancies": 0, "totalDelta": 0, "warnings": [] }
  },
  "accounts": [
    {
      "account": { "institution": "Bank of America", "accountType": "checking", ... },
      "summary": { "startingBalance": 100, "endingBalance": 300, ... },
      "transactions": [
        {
          "date": "2025-01-15",
          "description": "PAYROLL DIRECT DEP",
          "amount": 2500,
          "category": "Income",
          "subcategory": "Salary",
          "confidence": 0.95,
          "statementId": "CHECKING-1234-20250101-20250131",
          "periodLabel": "2025-01 BOA Checking",
          ...
        }
      ],
      "totalStatements": 2,
      "totalTransactions": 30
    }
  ]
}
```

### Key Differences: v1 vs v2

| Feature | v1 | v2 |
|---------|----|----|
| Structure | Flat statements array | Grouped by account |
| Root balances | Not included | Rolled up across accounts |
| Per-account totals | Not included | `totalStatements`, `totalTransactions` |
| Analytics | Not included | Quarterly cash flow, income vs expenses, lender summary, tax prep |
| Integrity checks | Not included | Per-statement balance validation with discrepancy reporting |
| Transaction traceability | Not included | `statementId`, `periodLabel` on each transaction |
| Metadata | Per-statement | Not included (simpler) |
| Use case | Individual statement processing | Multi-account rollup/reporting/analytics |

### Migration from v1 to v2

If you're consuming v1 output and want to migrate to v2:

1. Update your code to handle the `accounts` array instead of `statements`
2. Access transactions via `accounts[n].transactions` instead of `statements[n].transactions`
3. Use root-level `startingBalance`/`endingBalance` for overall totals
4. Note that v2 groups multiple statements for the same account into one account block

### Version Lifecycle

Future schema versions will follow this pattern:

1. New versions are added as `v3`, `v4`, etc.
2. Existing versions remain available indefinitely
3. Default version changes only in major releases
4. Deprecation warnings will be added before removal

### Confidence Semantics

The `confidence` field in transactions represents **parsing/OCR confidence**, not financial correctness:

| Value | Meaning |
|-------|---------|
| 0.95 (HIGH) | Exact pattern match with high certainty |
| 0.85 (MEDIUM_HIGH) | Strong keyword match |
| 0.75 (MEDIUM) | Partial or weaker pattern match |
| 0.50 (LOW) | Uncategorized or uncertain extraction |

**Important distinctions:**
- **Confidence ≠ Financial Accuracy**: A transaction with 0.95 confidence means the parser is confident about the extraction, not that the amount is financially verified
- **Low confidence flags**: Values < 0.75 indicate the parser had difficulty extracting or categorizing the transaction
- **OCR artifacts**: Low confidence may indicate OCR issues in the source PDF
- **Review recommendation**: Transactions with confidence < 0.75 should be manually reviewed

### Example Commands

```bash
# Use v1 (default)
pnpm parse-boa ./statement.pdf

# Explicitly use v1
pnpm parse-boa ./statement.pdf --schema-version v1

# Use v2 rollup format
pnpm parse-boa ./statement.pdf --schema-version v2

# Use environment variable
FINAL_RESULT_SCHEMA_VERSION=v2 pnpm parse-boa ./statement.pdf
```

## Deduplication

When processing multiple PDFs (especially when combined PDFs overlap with individual statement PDFs), the parser performs intelligent deduplication:

### Statement-Level Deduplication

**Identity Key**: `{accountNumberMasked}|{periodStart}|{periodEnd}`

When duplicate statements are found, the parser keeps the "best" one using these tie-break rules:

1. **Completeness score** - Higher wins (based on transaction count, valid totals, fewer warnings)
2. **Standalone over combined** - Prefers individual PDFs over combined PDFs (less merge artifacts)
3. **Lexicographic filename** - Deterministic final tie-breaker

### Transaction-Level Deduplication

**Identity Key**: `{date}|{amount}|{direction}|{normalized_description}`

Transactions are deduped within each statement, keeping the one with higher confidence score.

### Example Output Summary

```
=== Batch Processing Summary ===
Total PDFs found:       11
PDFs succeeded:         11
PDFs failed:            0
Statements before dedup: 11
Statements kept:        11
Statements deduped:     0
Transactions merged:    424
Transactions deduped:   1
================================
```

## Development

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
pnpm test:coverage  # With coverage report
```

### Lint

```bash
pnpm lint           # Check for issues
pnpm lint:fix       # Auto-fix issues
pnpm format         # Format with Prettier
```

## Project Structure

```
/src
  /cli                # Command-line interface
  /batch              # Batch processing orchestration
    batch-processor.ts    # Multi-PDF processing with dedup
  /parsers            # Bank-specific parsers
    /boa              # Bank of America parsers
      checking-parser.ts    # Checking account parsing
      credit-parser.ts      # Credit card parsing
      channel-extractor.ts  # Channel type & bank reference extraction
      merchant-extractor.ts # Merchant info extraction
      line-merger.ts        # Wrapped line handling
      transaction-normalizer.ts # Full transaction normalization
  /extractors         # PDF extraction utilities
  /normalizers        # Data transformation utilities
  /categorization     # Transaction categorization
    categories.ts         # Legacy category rules
    categorizer.ts        # Legacy categorizer
    categorizer-v2.ts     # Priority-based categorizer with confidence tiers
  /schemas            # Zod schemas and types
  /types              # TypeScript output types (aligned with JSON Schema)
  /validation         # AJV JSON Schema validation
  /utils              # Shared utilities
    directory-scanner.ts  # PDF file discovery and filtering
    statement-merger.ts   # Statement/transaction deduplication
/tests                # Test files (170+ tests)
/.windsurf            # Agent documentation
```

## Extending to Other Banks

The architecture supports adding parsers for other banks:

1. Create a new directory: `src/parsers/<bank>/`
2. Implement detection patterns for the bank's format
3. Create account-type-specific parsers
4. Add categorization rules for bank-specific descriptions
5. Register the parser in the main index

Example structure for a new bank:

```
/src/parsers/chase/
  index.ts           # Main parser and detection
  checking-parser.ts # Checking account logic
  credit-parser.ts   # Credit card logic
  types.ts           # Internal types
```

## Library Choices

| Library | Purpose | Rationale |
|---------|---------|-----------|
| `pdf-parse` | PDF extraction | Lightweight, no native deps, good text quality |
| `zod` | Schema validation | Runtime validation, TypeScript inference, composable |
| `ajv` | JSON Schema validation | Draft 2020-12 support, fast, comprehensive |
| `commander` | CLI parsing | Industry standard, auto-help, type-safe |
| `vitest` | Testing | Fast, ESM-native, Jest-compatible API |

## Known Limitations

- Scanned/image-based PDFs are not supported (OCR required)
- Some complex table layouts may not parse correctly
- Statement formats may vary; parser tuned for recent formats
- International/non-USD statements not supported
- Password-protected PDFs will fail with an error (captured in `parseErrors`)

## Troubleshooting

### "Could not determine account type"

The parser couldn't identify whether the statement is checking or credit. This usually means:
- The PDF text extraction failed
- The statement format is significantly different from expected

Try running with `--verbose` to see extracted text.

### "No transactions found"

The transaction section patterns didn't match. Possible causes:
- Statement has no transactions
- Format differs from expected patterns
- PDF text extraction issues

### Balance Mismatch Warning

In strict mode, the parser verifies that:
```
starting_balance + credits - debits = ending_balance
```

A mismatch may indicate:
- Missing transactions
- Parsing errors
- Fees/interest not captured

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `pnpm lint && pnpm test`
5. Submit a pull request
