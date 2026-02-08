# Supabase Database Integration

Optional integration with Supabase for persistent storage of parsed statements and transactions.

## Features

- **Deterministic deduplication**: Uses `statementId` and `transactionId` to prevent duplicates on re-import
- **Normalized schema**: Separate tables for accounts, statements, and transactions
- **Analytics views**: Pre-built views for monthly spending, merchant analysis, and account summaries
- **Human corrections**: Override system for category corrections without mutating raw data
- **Row Level Security**: Multi-tenant isolation via Supabase RLS policies

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com)

2. **Run the schema migrations** in the Supabase SQL Editor:

```sql
-- Run these files in order from .windsurf/skills/supabase-bank-ledger-schema/references/
-- 1. schema.sql - Creates tables and indexes
-- 2. rls-policies.sql - Enables row-level security
-- 3. views.sql - Creates analytics views
```

3. **Configure environment variables**:

```bash
# .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
BOA_USER_ID=your-user-uuid
```

## CLI Usage

```bash
# Parse and upload to Supabase
pnpm parse-boa --inputDir ./statements --upload --user-id "your-user-uuid"

# With explicit Supabase credentials
pnpm parse-boa --inputDir ./statements --upload \
  --supabase-url "https://your-project.supabase.co" \
  --supabase-key "your-anon-key" \
  --user-id "your-user-uuid"

# Combine with other options
pnpm parse-boa --inputDir ./statements --upload --user-id "your-uuid" \
  --out result.json --verbose
```

## Programmatic Usage

```typescript
import {
  createSupabaseClient,
  importV2Result,
  getTransactions,
  getMonthlyCategoryTotals,
  setTransactionOverride,
} from 'boa-statement-parser';

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

## Database Schema

| Table | Description |
|-------|-------------|
| `sources` | Uploaded PDF files with SHA-256 deduplication |
| `parse_runs` | Parser execution records with JSONB snapshots |
| `accounts` | Normalized account identity |
| `statements` | Statement periods and balances |
| `transactions` | Canonical transaction fact table |
| `transaction_overrides` | Human/ML category corrections |

## Analytics Views

| View | Description |
|------|-------------|
| `account_summary` | Account overview with latest balance |
| `monthly_category_totals` | Monthly spending by category |
| `merchant_spending` | Top merchants by total spent |
| `daily_balance` | Running balance per account |
| `transactions_needing_review` | Uncategorized or low-confidence transactions |
| `transactions_effective` | Transactions with overrides applied |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional service role key for server-side operations |
| `BOA_USER_ID` | Default user ID for CLI uploads |
| `BOA_UPLOAD` | Enable upload by default (`true`/`false`) |
