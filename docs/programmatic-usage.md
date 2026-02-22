# Programmatic Usage

Use `findata` as a library in your Node.js/TypeScript projects.

## Quick Start

```typescript
import { parseStatementFile } from 'findata';

const result = await parseStatementFile('./statement.pdf', {
  strict: true,
  verbose: false,
});

console.log(result.statement.transactions);
```

## Advanced Usage

```typescript
import { extractPDF, parseBoaStatement, detectAccountType } from 'findata';

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

## Layout-Aware Extraction

The layout engine provides utilities for positional text extraction:

```typescript
import { extractTextItems } from 'findata';
import { groupByRows, mergeWrappedDescriptions } from 'findata/layout';

// Extract with positions
const { items } = await extractTextItems('./statement.pdf');

// Group into rows (yTolerance default: 3.0)
const rows = groupByRows(items, 3.0);

// Merge wrapped descriptions
const merged = mergeWrappedDescriptions(rows);
```

## Balance Reconciliation

```typescript
import { validateReconciliation } from 'findata/validation';

const result = validateReconciliation(
  startingBalance,
  endingBalance,
  totalCredits,
  totalDebits,
  { tolerance: 0.01 }
);

if (!result.passed) {
  console.warn(`Balance mismatch: ${result.difference}`);
}
```

## Recurring Transaction Detection

```typescript
import { detectRecurring, detectRecurringFromStatements } from 'findata';

// From raw transactions
const result = detectRecurring(transactions, {
  minOccurrences: 3,        // Minimum occurrences to detect pattern (default: 2)
  maxIntervalVariance: 0.4, // Maximum coefficient of variation (default: 0.4)
});

// From parsed statements
const result = detectRecurringFromStatements(statements);

console.log(result.summary.estimatedMonthlyRecurring);
console.log(result.patterns.filter(p => p.isSubscription));
```

## Export Formats

### CSV

```typescript
import { toFinalResultV2, exportCsv, exportCsvByAccount } from 'findata';

const v2Result = toFinalResultV2(canonicalOutput);

// Export to CSV
const csvText = exportCsv(v2Result);

// Or export per account
const splitResults = exportCsvByAccount(v2Result);
for (const { filename, content } of splitResults) {
  fs.writeFileSync(filename, content);
}
```

### OFX

```typescript
import { toFinalResultV2, exportOfx } from 'findata';

const v2Result = toFinalResultV2(canonicalOutput);
const ofxText = exportOfx(v2Result);

// Or export a single account
import { exportAccountOfx } from 'findata';
const singleAccountOfx = exportAccountOfx(v2Result.accounts[0]);
```

## Supabase Integration

```typescript
import {
  createSupabaseClient,
  importV2Result,
  getTransactions,
  getMonthlyCategoryTotals,
  setTransactionOverride,
} from 'findata';

// Create client
const client = createSupabaseClient({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
});

// Import parsed results
const importResult = await importV2Result(client, userId, {
  result: v2Output,
});
console.log(`Inserted ${importResult.transactionsInserted} transactions`);

// Query transactions
const transactions = await getTransactions(client, userId, {
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  category: 'Food & Dining',
});

// Get monthly spending by category
const monthlyTotals = await getMonthlyCategoryTotals(client, userId);

// Override a transaction's category
await setTransactionOverride(client, userId, {
  transactionDbId: 'uuid-of-transaction',
  category: 'Entertainment',
  subcategory: 'Streaming',
  source: 'human',
  notes: 'Corrected from Food & Dining',
});
```

## Plaid Integration

```typescript
import {
  createPlaidClient,
  isPlaidConfigured,
  syncItemTransactions,
  createSyncService,
  reconcileTransactions,
} from 'findata';

// Check if Plaid is configured
if (!isPlaidConfigured()) {
  console.error('Set PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV');
  process.exit(1);
}

// Sync transactions for an item
const result = await syncItemTransactions(itemId, (batch) => {
  console.log(`Fetched ${batch.added.length} new transactions`);
});

// Use unified sync service with Supabase
const syncService = createSyncService({
  supabaseClient,
  userId: 'user-123',
  onProgress: (event) => {
    console.log(`${event.itemId}: ${event.phase} (+${event.added})`);
  },
});

// Sync single item
const syncResult = await syncService.syncItem(itemId);

// Sync all items for user
const results = await syncService.syncAllItems();

// Start scheduled sync (every 5 minutes)
syncService.startScheduledSync({
  intervalMs: 5 * 60 * 1000,
  runImmediately: true,
  onSyncComplete: (results) => console.log(`Synced ${results.length} items`),
});

// Stop scheduled sync
syncService.stopScheduledSync();

// Reconcile PDF vs Plaid
const reconcileResult = reconcileTransactions(pdfTransactions, plaidTransactions, {
  dateToleranceDays: 3,
  amountTolerancePercent: 0.01,
});
console.log(`Matched: ${reconcileResult.summary.matchedCount}`);
```

## ML Categorization

```typescript
import { HybridCategorizer, generateTrainingData } from 'findata';

// Initialize hybrid categorizer
const categorizer = new HybridCategorizer();
await categorizer.initialize();

// Train with synthetic data
const trainingData = generateTrainingData(5000);
await categorizer.trainML(trainingData, { epochs: 50 });

// Categorize
const result = await categorizer.categorizeAsync('STARBUCKS COFFEE SEATTLE WA', 'CHECKCARD');
console.log(result.category);    // 'Food & Dining'
console.log(result.subcategory); // 'Restaurants'
console.log(result.source);      // 'rule' | 'ml' | 'hybrid'

// Save/load model
await categorizer.saveMLModel('./models/categorizer');
await categorizer.loadMLModel('./models/categorizer');

// Clean up
categorizer.dispose();
```

See [Categorization](./categorization.md) for full ML documentation.
