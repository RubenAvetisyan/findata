# Output Schema

The output conforms to JSON Schema Draft 2020-12. Full schemas are available at:
- `schemas/final_result.v1.schema.json`
- `schemas/final_result.v2.schema.json`

## Output Structure

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

## Schema Versioning

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
      "account": { "institution": "Bank of America", "accountType": "checking", "..." : "..." },
      "summary": { "startingBalance": 100, "endingBalance": 200, "..." : "..." },
      "transactions": ["..."],
      "metadata": { "parserVersion": "1.0.0", "parsedAt": "...", "warnings": [] }
    }
  ],
  "totalStatements": 1,
  "totalTransactions": 5
}
```

### Schema v2 (BOFA Rollup)

A rollup format that groups transactions by account with aggregated totals, analytics, and integrity checks:

```json
{
  "schemaVersion": "v2",
  "startingBalance": 100,
  "endingBalance": 500,
  "totalStatements": 3,
  "totalTransactions": 50,
  "analytics": {
    "quarterlyCashFlow": ["..."],
    "incomeVsExpenses": { "totalIncome": 5000, "totalExpenses": 4500, "netIncome": 500, "..." : "..." },
    "lenderSummary": { "averageMonthlyIncome": 2500, "incomeStabilityScore": 85, "..." : "..." },
    "taxPreparation": { "taxYear": 2025, "totalTaxableIncome": 30000, "..." : "..." }
  },
  "integrity": {
    "overallValid": true,
    "statementsChecked": 3,
    "statementsWithIssues": 0,
    "statementResults": ["..."],
    "summary": { "totalDiscrepancies": 0, "totalDelta": 0, "warnings": [] }
  },
  "accounts": [
    {
      "account": { "institution": "Bank of America", "accountType": "checking", "..." : "..." },
      "summary": { "startingBalance": 100, "endingBalance": 300, "..." : "..." },
      "transactions": [
        {
          "date": "2025-01-15",
          "description": "PAYROLL DIRECT DEP",
          "amount": 2500,
          "category": "Income",
          "subcategory": "Salary",
          "confidence": 0.95,
          "statementId": "CHECKING-1234-20250101-20250131",
          "periodLabel": "2025-01 BOA Checking"
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

1. Update your code to handle the `accounts` array instead of `statements`
2. Access transactions via `accounts[n].transactions` instead of `statements[n].transactions`
3. Use root-level `startingBalance`/`endingBalance` for overall totals
4. Note that v2 groups multiple statements for the same account into one account block

### Version Lifecycle

1. New versions are added as `v3`, `v4`, etc.
2. Existing versions remain available indefinitely
3. Default version changes only in major releases
4. Deprecation warnings will be added before removal

### Schema Versioning Notes

- **v1 stays canonical raw output**: The v1 schema represents the raw parsed output from individual statements
- **v2 is rollup + integrity**: The v2 schema groups by account and adds analytics/integrity checks
- **schemaVersion remains v1/v2**: The `schemaVersion` field is a const and should not be changed
- **schemaRevision is optional**: Use the new optional `schemaRevision` field for minor version tracking without breaking validation

## Confidence Semantics

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

## Deduplication

When processing multiple PDFs, the parser performs intelligent deduplication:

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
