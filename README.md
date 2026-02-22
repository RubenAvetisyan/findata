# boa-statement-parser

A production-ready Node.js library and CLI for parsing Bank of America bank statement PDFs into clean, normalized, categorized JSON with full JSON Schema validation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Multi-format support** — Checking, savings, and credit card statements
- **Batch processing** — Process entire directories with smart deduplication
- **70+ categorization rules** — Priority-ordered with confidence tiers
- **ML categorization** — Optional TensorFlow.js hybrid approach
- **Channel detection** — CHECKCARD, ATM, Zelle, Online Banking, etc.
- **Multiple export formats** — JSON, CSV, OFX
- **Schema validation** — AJV (Draft 2020-12) + Zod
- **Unified sync pipeline** — PDF + Plaid + Supabase with gap-fill and DB as source of truth
- **Integrations** — Supabase persistence, Plaid live banking
- **TypeScript-first** — Full type safety with strict mode

## Installation

```bash
npm install -g boa-statement-parser   # global
npm install boa-statement-parser      # local
```

## Quick Start

```bash
# Initialize project (creates .env, ML model, statements dir)
parse-boa init

# Parse a single PDF
parse-boa ./statement.pdf --out result.json

# Batch process a directory
parse-boa --inputDir ./statements --out result.json --verbose
```

```typescript
import { parseStatementFile } from 'boa-statement-parser';

const result = await parseStatementFile('./statement.pdf', {
  strict: true,
  verbose: false,
});
console.log(result.statement.transactions);
```

## Documentation

| Guide | Description |
|-------|-------------|
| [CLI Reference](./docs/cli.md) | All commands, options, and usage examples |
| [Programmatic Usage](./docs/programmatic-usage.md) | Library API, advanced usage, and code examples |
| [Output Schema](./docs/output-schema.md) | JSON schema structure, v1/v2 versioning, deduplication |
| [Categorization](./docs/categorization.md) | Rule-based and ML categorization, training |
| [Channels & References](./docs/channels-and-references.md) | Transaction channel types and bank reference extraction |
| [Recurring Transactions](./docs/recurring-transactions.md) | Subscription and recurring payment detection |
| [Export Formats](./docs/export-formats.md) | CSV and OFX export details |
| [Supabase Integration](./docs/supabase.md) | Database storage, analytics views, RLS |
| [Plaid Integration](./docs/plaid.md) | Live banking sync, reconciliation, webhooks |
| [Environment Variables](./docs/environment-variables.md) | All configuration options |
| [Architecture](./docs/architecture.md) | Project structure, parsing pipeline, extensibility |

## Development

```bash
pnpm build              # Build
pnpm test               # Run all tests
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
