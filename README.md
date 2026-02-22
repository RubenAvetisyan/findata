# findata

An extensible financial data toolkit for Node.js — parse bank statement PDFs, sync live transactions via Plaid, persist to Supabase, and export to JSON/CSV/OFX. Ships with **Bank of America** as the first institution integration; designed so you can add Chime, Capital One, Self.inc, or any other institution.

[![npm](https://img.shields.io/npm/v/findata-kit.svg)](https://www.npmjs.com/package/findata-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why findata?

Most financial tools are locked to one bank or one data source. **findata** gives you a single pipeline that combines offline PDFs, live Plaid data, and a Supabase database — with pluggable institution parsers so you're never locked in.

## Features

### Core Platform
- **Pluggable institution parsers** — Add any bank's PDF format as a parser module
- **Unified sync pipeline** — PDF + Plaid + Supabase with automatic gap-fill; database as source of truth
- **Plaid integration** — Live transaction sync, cursor-based incremental updates, reconciliation
- **Supabase persistence** — Normalized schema, analytics views, RLS, human corrections
- **70+ categorization rules** — Priority-ordered with confidence tiers
- **ML categorization** — Optional TensorFlow.js hybrid approach (rules + neural network)
- **Multiple export formats** — JSON (v1/v2 schema), CSV, OFX 2.2
- **Schema validation** — AJV (Draft 2020-12) + Zod runtime validation
- **Recurring detection** — Automatic subscription and recurring payment identification
- **TypeScript-first** — Full type safety with strict mode

### Supported Institutions

| Institution | Status | Parser Module |
|-------------|--------|---------------|
| **Bank of America** | ✅ Shipped | `src/parsers/boa/` |
| Chime | 🔜 Planned | `src/parsers/chime/` |
| Capital One | 🔜 Planned | `src/parsers/capitalone/` |
| Self.inc | 🔜 Planned | `src/parsers/self/` |
| *Your bank* | [Contribute!](#adding-a-new-institution) | `src/parsers/<bank>/` |

> The **Bank of America** parser supports checking, savings, and credit card statements plus "Print Transaction Details" PDFs from online banking.

## Installation

```bash
npm install -g findata-kit   # global CLI
npm install findata-kit      # library
```

## Quick Start

### CLI

```bash
# Initialize project (creates .env, ML model, statements dir)
findata init

# Parse a single PDF
findata ./statement.pdf --out result.json

# Batch process a directory
findata --inputDir ./statements --out result.json --verbose

# Unified build: PDF + Plaid live data + Supabase → v2 output
findata plaid build --inputDir ./statements --out result.json

# Plaid-only (no local PDFs, database as source of truth)
findata plaid build --start-date 2025-01-01 --out result.json
```

### Library

```typescript
import { parseStatementFile } from 'findata-kit';

const result = await parseStatementFile('./statement.pdf', {
  strict: true,
  verbose: false,
});
console.log(result.statement.transactions);
```

Sub-path imports for tree-shaking:

```typescript
import { reconcileTransactions } from 'findata-kit/plaid';
import { importV2Result } from 'findata-kit/supabase';
import { exportCsv } from 'findata-kit/output';
import { groupByRows } from 'findata-kit/layout';
import { validateOutput } from 'findata-kit/validation';
import { HybridCategorizer } from 'findata-kit/categorization';
```

## Adding a New Institution

The architecture is designed for pluggable bank parsers. To add support for a new institution:

1. Create a parser directory: `src/parsers/<bank>/`
2. Implement a detection function (identify the institution from PDF text)
3. Create account-type-specific parsers (checking, savings, credit)
4. Add bank-specific categorization rules if needed
5. Register the parser in `src/parsers/index.ts`

```
src/parsers/
  boa/                  # Bank of America (shipped)
  chime/                # Chime (example)
    index.ts            # Detection + main parser
    checking-parser.ts  # Checking account logic
    types.ts            # Internal types
  capitalone/           # Capital One (example)
    ...
```

See [Architecture](./docs/architecture.md) for the full parsing pipeline details.

## Documentation

| Guide | Description |
|-------|-------------|
| [CLI Reference](./docs/cli.md) | All commands, options, and usage examples |
| [Programmatic Usage](./docs/programmatic-usage.md) | Library API, advanced usage, and code examples |
| [Output Schema](./docs/output-schema.md) | JSON schema structure, v1/v2 versioning |
| [Categorization](./docs/categorization.md) | Rule-based and ML categorization, training |
| [Channels & References](./docs/channels-and-references.md) | Transaction channel types and bank references |
| [Recurring Transactions](./docs/recurring-transactions.md) | Subscription and recurring payment detection |
| [Export Formats](./docs/export-formats.md) | CSV and OFX export details |
| [Supabase Integration](./docs/supabase.md) | Database storage, analytics views, RLS |
| [Plaid Integration](./docs/plaid.md) | Live banking sync, reconciliation, webhooks |
| [Environment Variables](./docs/environment-variables.md) | All configuration options |
| [Architecture](./docs/architecture.md) | Parsing pipeline, project structure, extensibility |

## Development

```bash
pnpm build              # Build
pnpm test               # Run all tests (523 tests)
pnpm test:watch         # Watch mode
pnpm test:coverage      # With coverage
pnpm lint               # Check for issues
pnpm lint:fix           # Auto-fix
pnpm format             # Format with Prettier
```

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `pnpm lint && pnpm test`
5. Submit a pull request

**Adding a new bank parser?** See [Adding a New Institution](#adding-a-new-institution) above and the [Architecture](./docs/architecture.md) guide.
