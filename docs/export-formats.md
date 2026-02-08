# Export Formats

The parser supports exporting to multiple formats beyond JSON.

## CSV Export

Export to CSV format for spreadsheet import (Excel, Google Sheets, etc.).

### CLI Usage

```bash
# Export single PDF to CSV
pnpm parse-boa ./statement.pdf --format csv --out statement.csv

# Export directory of PDFs to CSV
pnpm parse-boa --inputDir ./statements --format csv --out combined.csv

# Split into separate files per account (boa_checking_3529.csv, boa_savings_4971.csv)
pnpm parse-boa --inputDir ./statements --format csv --split-accounts --out ./output/
```

### CSV Columns

| Column | Description |
|--------|-------------|
| `Date` | Transaction date (ISO format) |
| `Posted Date` | Posted date if available |
| `Description` | Cleaned transaction description |
| `Merchant` | Extracted merchant name |
| `Amount` | Signed amount (negative for debits) |
| `Direction` | `credit` or `debit` |
| `Type` | Transaction type (Purchase, Deposit, Transfer, etc.) |
| `Account Type` | `checking`, `credit`, `savings` |
| `Account Number` | Masked account number |
| `Category` | Assigned category |
| `Subcategory` | Assigned subcategory |
| `Confidence` | Categorization confidence score |

### Programmatic Usage

```typescript
import { toFinalResultV2, exportCsv, exportCsvByAccount } from 'boa-statement-parser';

const v2Result = toFinalResultV2(canonicalOutput);

// Export to CSV
const csvText = exportCsv(v2Result);

// Or export per account
const splitResults = exportCsvByAccount(v2Result);
for (const { filename, content } of splitResults) {
  fs.writeFileSync(filename, content);
}
```

## OFX Export

Export to OFX (Open Financial Exchange) format for import into accounting software like Quicken, GnuCash, or Dolibarr.

### CLI Usage

```bash
# Export single PDF to OFX
pnpm parse-boa ./statement.pdf --format ofx --out statement.ofx

# Export directory of PDFs to OFX
pnpm parse-boa --inputDir ./statements --format ofx --out combined.ofx

# Split into separate files per account (boa_checking_3529.ofx, boa_savings_4971.ofx)
pnpm parse-boa --inputDir ./statements --format ofx --split-accounts --out ./output/

# With verbose output
pnpm parse-boa ./statement.pdf --format ofx --out statement.ofx --verbose
```

### OFX Transaction Types

The exporter automatically detects specific OFX transaction types from descriptions:

| Type | Detected From |
|------|---------------|
| `DEP` | Deposit, Direct Dep, Payroll |
| `POS` | Checkcard, Purchase, Debit Card |
| `ATM` | ATM, Cash Withdrawal |
| `XFER` | Zelle, Transfer, Wire |
| `CHECK` | Check #1234 (also extracts `CHECKNUM`) |
| `FEE` | Fee, Service Charge, Overdraft |
| `PAYMENT` | Payment, Bill Pay, ACH |
| `INT` | Interest |

### Programmatic Usage

```typescript
import { toFinalResultV2, exportOfx } from 'boa-statement-parser';

const v2Result = toFinalResultV2(canonicalOutput);

// Export to OFX
const ofxText = exportOfx(v2Result);

// Or export a single account
import { exportAccountOfx } from 'boa-statement-parser';
const singleAccountOfx = exportAccountOfx(v2Result.accounts[0]);
```

### OFX Features

- **FITID**: Uses deterministic `transactionId` as OFX FITID for reliable duplicate detection
- **Signed amounts**: Credits are positive, debits are negative
- **Date formatting**: Converts ISO dates to OFX YYYYMMDD format
- **Multiple accounts**: Generates one `<STMTTRNRS>` block per account
- **Ledger balance**: Includes ending balance with date
