# Plaid API Integration

Optional integration with Plaid for live banking data ingestion, complementing the PDF statement parsing pipeline.

## Features

- **Live transaction sync**: Fetch transactions directly from bank accounts via Plaid API
- **Cursor-based sync**: Incremental updates using Plaid's `/transactions/sync` endpoint
- **Unified sync service**: Combines rate limiting, retry logic, and Supabase persistence
- **Scheduled sync**: Automatic periodic syncing with configurable intervals
- **Webhook support**: Real-time updates via Plaid webhooks
- **PDF reconciliation**: Compare PDF-derived transactions against live Plaid data
- **Advanced products**: Identity verification, ACH auth, liabilities, investments

## Setup

1. **Get Plaid API credentials** at [dashboard.plaid.com](https://dashboard.plaid.com)

2. **Configure environment variables**:

```bash
# .env
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-secret
PLAID_ENV=sandbox  # or production

# Required for OAuth-based banks (e.g. Bank of America in production)
# Must be registered in Plaid Dashboard > Team Settings > API > Allowed redirect URIs
PLAID_REDIRECT_URI=https://localhost:8484/oauth-callback
```

## CLI Commands

```bash
# Test Plaid connection
findata plaid test

# Link a new bank account
findata plaid link --user-id "your-user-uuid"

# List linked accounts
findata plaid list

# Check item status
findata plaid status --item-id <id>

# Sync transactions for a single item
findata plaid sync --item-id <id>

# Sync all linked items (requires Supabase)
findata plaid sync-all --user-id "your-user-uuid"

# Full sync (ignore cursor, fetch all history)
findata plaid sync --item-id <id> --full

# Remove linked account
findata plaid remove --item-id <id>

# Reconcile PDF vs Plaid transactions
findata plaid reconcile --item-id <id> ./statement.pdf

# Also supports "Print Transaction Details" PDFs from BOA online banking
findata plaid reconcile --item-id <id> ./transaction-details.pdf

# Or reconcile from a pre-parsed JSON result
findata plaid reconcile --item-id <id> ./result.json

# Merge Plaid data into an existing result.json
findata plaid merge --item-id <id> ./result.json

# Unified build: PDF + Plaid + Supabase → v2 output
findata plaid build --inputDir ./statements --out result.json --verbose

# Plaid-only build (no local PDFs, database as source of truth)
findata plaid build --start-date 2025-01-01 --out result.json --verbose

# Advanced: Get account owner identity
findata plaid identity --item-id <id>

# Advanced: Get ACH routing/account numbers
findata plaid auth --item-id <id>

# Advanced: Get credit card/loan balances
findata plaid liabilities --item-id <id>

# Advanced: Get investment holdings
findata plaid holdings --item-id <id>
```

## Programmatic Usage

```typescript
import {
  createPlaidClient,
  isPlaidConfigured,
  syncItemTransactions,
  createSyncService,
  reconcileTransactions,
} from 'findata-kit';

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
```

## Reconciliation

The reconciliation engine matches PDF-derived transactions against Plaid data. It auto-detects the PDF format:

- **Monthly statements** — standard BOA statement PDFs parsed via `parseBoaMultipleStatements`
- **"Print Transaction Details"** — online banking transaction export PDFs parsed via `parseTransactionDetails`

| Match Type | Description |
|------------|-------------|
| `exact` | Same date, amount, and merchant |
| `fuzzy` | Within date tolerance, similar merchant |
| `amount_only` | Same amount, different date/merchant |

```typescript
import { reconcileTransactions, formatReconciliationReport } from 'findata-kit';

const result = reconcileTransactions(pdfTxns, plaidTxns, {
  dateToleranceDays: 3,
  amountTolerancePercent: 0.01,
});

console.log(formatReconciliationReport(result));
// Output:
// === Reconciliation Report ===
// PDF Transactions: 50
// Plaid Transactions: 48
// Matched: 45 (90.0%)
// Unmatched PDF: 5
// Unmatched Plaid: 3
```

## Webhook Handling

```typescript
import { createWebhookHandler } from 'findata-kit';

// Create Express/Fastify-compatible handler
const handler = createWebhookHandler({
  onSyncAvailable: async (itemId, newCount) => {
    await syncService.syncItem(itemId);
  },
  onLoginRequired: async (itemId) => {
    // Notify user to re-authenticate
  },
});

// Use with Express
app.post('/webhooks/plaid', handler);
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PLAID_CLIENT_ID` | Plaid API client ID |
| `PLAID_SECRET` | Plaid API secret |
| `PLAID_ENV` | Environment: `sandbox` or `production` (default: `sandbox`) |
| `PLAID_WEBHOOK_URL` | Optional webhook endpoint URL |
| `PLAID_REDIRECT_URI` | OAuth redirect URI (required for OAuth-based banks like BOA) |
