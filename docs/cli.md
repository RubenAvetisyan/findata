# CLI Reference

The `findata` CLI provides a full-featured command-line interface for parsing bank statement PDFs, syncing live data via Plaid, and persisting to Supabase. Currently ships with Bank of America as the first institution parser.

> **Note:** The `parse-boa` command is still available as a backward-compatible alias.

## Initialization

After installing, run the init command to set up required files:

```bash
# Initialize with .env file and pre-trained ML model
findata init

# Skip ML model (if you don't need ML categorization)
findata init --no-model

# Overwrite existing files
findata init --force
```

This creates:
- `.env` - Configuration file with sensible defaults
- `models/categorizer/` - Pre-trained ML model for transaction categorization
- `statements/` - Directory to place your PDF files

## Basic Usage

```bash
# Parse a single statement PDF
findata ./statement.pdf

# Save output to a file
findata ./statement.pdf --out result.json

# Enable verbose mode for debugging
findata ./statement.pdf --verbose

# Enable strict validation
findata ./statement.pdf --strict

# Compact JSON output (no pretty-printing)
findata ./statement.pdf --no-pretty
```

## Batch Directory Processing

Process multiple PDF files from a directory:

```bash
# Process all PDFs in a directory
findata --inputDir "C:\Users\...\Statements" --out result.json

# With verbose output showing progress
findata --inputDir ./statements --out result.json --verbose

# With strict validation
findata --inputDir ./statements --out result.json --strict --verbose
```

Batch processing features:
- Scans directory for `*.pdf` files (case-insensitive)
- Skips temporary files (`~$...`) and zero-byte files
- Processes files in deterministic order (sorted by filename)
- Deduplicates statements across all PDFs
- Produces single consolidated output matching single-PDF schema

## Output Format Options

```bash
# JSON output (default)
findata ./statement.pdf --out result.json

# OFX output for accounting software
findata ./statement.pdf --format ofx --out statement.ofx

# CSV output for spreadsheets
findata ./statement.pdf --format csv --out statement.csv

# Split into separate files per account
findata --inputDir ./statements --format csv --split-accounts --out ./output/
```

See [Export Formats](./export-formats.md) for details on CSV and OFX output.

## Schema Version Selection

```bash
# Use v2 rollup format (default)
findata ./statement.pdf

# Explicitly use v1 flat format
findata ./statement.pdf --schema-version v1

# Explicitly use v2
findata ./statement.pdf --schema-version v2

# Use environment variable
FINAL_RESULT_SCHEMA_VERSION=v2 findata ./statement.pdf
```

See [Output Schema](./output-schema.md) for schema version details.

## ML Training

```bash
# Train ML model using synthetic data only
findata --train-ml --model-out ./models/categorizer

# Train ML model from your parsed statements (recommended)
findata --train-ml --inputDir ./statements --model-out ./models/categorizer

# Train with more epochs for better accuracy
findata --train-ml --inputDir ./statements --model-out ./models/categorizer --epochs 100 --verbose
```

See [Categorization](./categorization.md) for ML details.

## Recurring Transaction Detection

```bash
# Detect recurring transactions
findata --inputDir ./statements --detect-recurring --out result.json

# With verbose output showing detection stats
findata --inputDir ./statements --detect-recurring --verbose --out result.json
```

See [Recurring Transactions](./recurring-transactions.md) for details.

## Supabase Upload

```bash
# Parse and upload to Supabase
findata --inputDir ./statements --upload --user-id "your-user-uuid"

# With explicit Supabase credentials
findata --inputDir ./statements --upload \
  --supabase-url "https://your-project.supabase.co" \
  --supabase-key "your-anon-key" \
  --user-id "your-user-uuid"
```

See [Supabase Integration](./supabase.md) for setup and details.

## Plaid Commands

```bash
# Test Plaid connection
findata plaid test

# Link a new bank account
findata plaid link --user-id "your-user-uuid"

# List linked accounts
findata plaid list

# Sync transactions
findata plaid sync --item-id <id>

# Sync all linked items
findata plaid sync-all --user-id "your-user-uuid"

# Reconcile PDF vs Plaid transactions (monthly statement)
findata plaid reconcile --item-id <id> ./statement.pdf

# Reconcile "Print Transaction Details" PDF from online banking
findata plaid reconcile --item-id <id> ./transaction-details.pdf

# Reconcile from pre-parsed JSON result
findata plaid reconcile --item-id <id> ./result.json

# Merge Plaid data into an existing result.json
findata plaid merge --item-id <id> ./result.json
```

### Unified Build (PDF + Plaid + Supabase)

The `plaid build` command runs the full unified sync pipeline — combining local PDFs, Plaid live data, and Supabase database into a single v2 output:

```bash
# Build from PDFs + Plaid gap-fill (recommended)
findata plaid build --inputDir ./statements --out result.json --verbose

# Plaid-only mode (no local PDFs, database as source of truth)
findata plaid build --start-date 2025-01-01 --out result.json --verbose

# With custom date range
findata plaid build --inputDir ./statements --start-date 2024-06-01 --end-date 2025-06-01 --out result.json
```

The pipeline stages:
1. **Scan & parse PDFs** → upload to Supabase (dedup by transactionId)
2. **Query Supabase** for existing data ranges
3. **Gap analysis** — identify date ranges not covered by PDF + DB
4. **Fill gaps from Plaid** → upload gap-fill transactions to Supabase
5. **Build v2 output** from Supabase (database is source of truth)

See [Plaid Integration](./plaid.md) for full command reference.

## All CLI Options

| Option | Description |
|--------|-------------|
| `-d, --inputDir <dir>` | Directory containing PDF files to batch process |
| `-o, --out <file>` | Output file path (default: stdout) |
| `-f, --format <format>` | Output format: `json`, `ofx`, or `csv` (default: json) |
| `--split-accounts` | Split output into separate files per account |
| `-v, --verbose` | Enable verbose output with debug info |
| `-s, --strict` | Enable strict validation mode |
| `--pretty` | Pretty-print JSON output (default: true) |
| `--no-pretty` | Disable pretty-printing |
| `--single` | Parse as single statement (legacy mode) |
| `--schema-version <v1\|v2>` | Output schema version (default: v2) |
| `--train-ml` | Train ML categorizer from parsed transactions |
| `--ml` | Use ML-based categorization (hybrid mode) |
| `--model <path>` | Path to ML model directory (for loading) |
| `--model-out <path>` | Output path for trained ML model |
| `--epochs <number>` | Number of training epochs (default: 50) |
| `--detect-recurring` | Detect recurring transactions and include in output |
| `--upload` | Upload parsed results to Supabase database |
| `--supabase-url <url>` | Supabase project URL (or use `SUPABASE_URL` env var) |
| `--supabase-key <key>` | Supabase anon/service role key (or use `SUPABASE_ANON_KEY` env var) |
| `--user-id <id>` | User ID for Supabase RLS (required for `--upload`) |
| `--version` | Show version number |
| `--help` | Show help |

### Init Command Options

| Option | Description |
|--------|-------------|
| `init` | Initialize project with .env file and ML model |
| `init --force` | Overwrite existing files |
| `init --no-model` | Skip copying ML model files |
