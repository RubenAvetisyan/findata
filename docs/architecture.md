# Architecture

## Supported PDF Formats

The parser supports two types of Bank of America PDF documents:

### Monthly Statement PDFs

Traditional monthly bank statements downloaded from BOA Online Banking or received by mail. These contain:
- Account summary with beginning/ending balances
- Transaction history organized by type (deposits, withdrawals, checks, fees)
- Statement period information

### Transaction Details PDFs ("Print Transaction Details")

Web page exports from BOA Online Banking's "Print Transaction Details" feature. These contain:
- Custom date range transaction history
- Account activity from the online banking portal
- Useful for exporting transactions outside of monthly statement periods

**Format characteristics:**
- Header: `Bank of America | Online Banking | Deposit | Print Transaction Details`
- Account line: `Adv Plus Banking - 3529 : Account Activity` or `Advantage Savings - 4971 : Account Activity`
- Date range: `Showing results for "All Transactions, MM/DD/YYYY To MM/DD/YYYY"`

Both formats are automatically detected and can be processed together in batch mode.

## Project Structure

```
/src
  /cli                # Command-line interface
  /batch              # Batch processing orchestration
    batch-processor.ts    # Multi-PDF processing with dedup
  /parsers            # Bank-specific parsers
    /boa              # Bank of America parsers
      checking-parser.ts    # Checking account parsing
      savings-parser.ts     # Savings account parsing
      credit-parser.ts      # Credit card parsing
      transaction-details-parser.ts # "Print Transaction Details" PDF parsing
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
    ml-categorizer.ts     # TensorFlow.js ML-based categorizer
    hybrid-categorizer.ts # Combined rule + ML categorization
    training-data-generator.ts # Synthetic training data generation
  /schemas            # Zod schemas and types
  /types              # TypeScript output types (aligned with JSON Schema)
  /validation         # AJV JSON Schema validation
  /utils              # Shared utilities
    directory-scanner.ts  # PDF file discovery and filtering
    statement-merger.ts   # Statement/transaction deduplication
/tests                # Test files (367+ tests)
/.windsurf            # Agent documentation
```

## Parsing Pipeline

```
PDF File → Extractor → Segmenter → Section Parser → Normalizer → Categorizer → Validator → JSON Output
```

1. **Extractor** (`/src/extractors/`) - Extracts raw text from PDF files using `pdfjs-dist` (layout-aware) or `pdf-parse` (fallback)
2. **Parser** (`/src/parsers/boa/`) - Detects account type and parses bank-specific formats
3. **Normalizer** (`/src/normalizers/`) - Transforms dates, amounts, deduplicates, and sorts
4. **Categorizer** (`/src/categorization/`) - Assigns categories via rule-based or ML approach
5. **Validator** (`/src/validation/`) - Validates output against JSON Schema Draft 2020-12 using AJV
6. **Output** (`/src/output/`) - Transforms to v1/v2 schema, CSV, OFX formats

## Parsing Engine

### Layout-Aware Extraction (pdfjs-dist)

The parser includes a layout-aware extraction engine using `pdfjs-dist` that extracts text with positional coordinates (x, y, width, height). This enables reliable row/column reconstruction for table parsing.

**Key advantages:**
- **Positional data**: Each text item includes x/y coordinates for accurate row grouping
- **Column detection**: Infers column boundaries from header rows or X-coordinate clustering
- **Wrapped line handling**: Merges multi-line descriptions that span multiple PDF text items
- **Resilience**: More robust to minor formatting changes across statement versions

**When to use each extractor:**
- **pdfjs-dist (default)**: Best for structured table data, transaction parsing
- **pdf-parse (fallback)**: Simpler extraction when layout isn't critical

### Future Extensions

- **MuPDF adapter**: Optional high-fidelity extraction (not yet implemented)
- **OCR pathway**: For scanned/image-based PDFs (extension point documented)

## Library Choices

| Library | Purpose | Rationale |
|---------|---------|-----------|
| `pdfjs-dist` | Layout-aware PDF extraction | Positional text extraction for reliable table parsing |
| `pdf-parse` | Fallback PDF extraction | Lightweight, no native deps, good for simple text |
| `zod` | Schema validation | Runtime validation, TypeScript inference, composable |
| `ajv` | JSON Schema validation | Draft 2020-12 support, fast, comprehensive |
| `commander` | CLI parsing | Industry standard, auto-help, type-safe |
| `vitest` | Testing | Fast, ESM-native, Jest-compatible API |

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

## Error Handling

### Levels of Errors

1. **Fatal Errors** (thrown as exceptions): File not found, invalid PDF format, unreadable content
2. **Warnings** (added to `metadata.warnings`): Missing account number, unparseable transactions, balance mismatches
3. **Silent Handling** (graceful defaults): Unknown categories → "Uncategorized", missing merchant → null

### Strict Mode

When `--strict` is enabled:
- Schema validation is enforced
- Balance calculations are verified
- Warnings are elevated to errors

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
