# Environment Variables

The parser automatically loads environment variables from a `.env` file using [dotenv](https://www.npmjs.com/package/dotenv). No additional configuration required.

## Quick Setup

```bash
# Copy the example file
cp .env.example .env

# Edit as needed
nano .env  # or use your preferred editor
```

## Application Settings

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `FINAL_RESULT_SCHEMA_VERSION` | `v1`, `v2` | `v2` | Controls the output JSON schema format |

**`FINAL_RESULT_SCHEMA_VERSION`**

- **`v1`**: Original flat format with a `statements` array. Best for individual statement processing.
- **`v2`**: Rollup format grouped by account with analytics, integrity checks, and aggregated totals. Best for multi-account reporting and financial analysis.

Resolution precedence (highest to lowest):
1. CLI flag: `--schema-version v2`
2. `.env` file: `FINAL_RESULT_SCHEMA_VERSION=v2`
3. Default: `v2`

## Input/Output Settings

| Variable | CLI Equivalent | Default | Description |
|----------|----------------|---------|-------------|
| `BOA_INPUT_DIR` | `--inputDir` | (none) | Directory containing PDF files to process |
| `BOA_OUTPUT_FILE` | `--out` | stdout | Output file path |
| `BOA_FORMAT` | `--format` | `json` | Output format: `json`, `ofx`, `csv` |
| `BOA_SPLIT_ACCOUNTS` | `--split-accounts` | `false` | Split output into separate files per account |

**Example:**
```bash
# .env
BOA_INPUT_DIR=C:\Users\YourName\Documents\Statements
BOA_OUTPUT_FILE=result.json
BOA_FORMAT=json
```

Now you can simply run:
```bash
pnpm parse-boa
```

## Parsing Options

| Variable | CLI Equivalent | Default | Description |
|----------|----------------|---------|-------------|
| `BOA_VERBOSE` | `--verbose` | `false` | Enable verbose output with debug info |
| `BOA_STRICT` | `--strict` | `false` | Enable strict validation mode |
| `BOA_PRETTY` | `--pretty` | `true` | Pretty-print JSON output |
| `BOA_SINGLE` | `--single` | `false` | Parse as single statement (legacy mode) |
| `BOA_DETECT_RECURRING` | `--detect-recurring` | `false` | Detect recurring transactions |

## ML Categorization Settings

| Variable | CLI Equivalent | Default | Description |
|----------|----------------|---------|-------------|
| `BOA_ML` | `--ml` | `false` | Use ML-based categorization (hybrid mode) |
| `BOA_MODEL_PATH` | `--model` | (none) | Path to ML model directory for loading |
| `BOA_MODEL_OUT` | `--model-out` | (none) | Output path for trained ML model |
| `BOA_TRAIN_ML` | `--train-ml` | `false` | Train ML categorizer from parsed transactions |
| `BOA_EPOCHS` | `--epochs` | `50` | Number of training epochs |

**Example ML configuration:**
```bash
# .env
BOA_ML=true
BOA_MODEL_PATH=./models/categorizer
```

## Supabase Settings

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional service role key for server-side operations |
| `BOA_USER_ID` | Default user ID for CLI uploads |
| `BOA_UPLOAD` | Enable upload by default (`true`/`false`) |

## Plaid Settings

| Variable | Description |
|----------|-------------|
| `PLAID_CLIENT_ID` | Plaid API client ID |
| `PLAID_SECRET` | Plaid API secret |
| `PLAID_ENV` | Environment: `sandbox`, `development`, or `production` |
| `PLAID_WEBHOOK_URL` | Optional webhook endpoint URL |

## Node.js Runtime

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `NODE_ENV` | `development`, `production`, `test` | `development` | Node.js environment mode |

- **`development`**: Enables verbose error messages, development-only features
- **`production`**: Optimizes for performance, minimizes logging
- **`test`**: Used during test execution (set automatically by Vitest)

## TensorFlow.js Settings

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `TF_FORCE_BACKEND` | `cpu`, `webgl`, `wasm` | `cpu` | Force a specific TensorFlow.js backend |
| `TF_CPP_MIN_LOG_LEVEL` | `0`, `1`, `2`, `3` | `0` | TensorFlow C++ logging level |
| `TF_ENABLE_ONEDNN_OPTS` | `0`, `1` | `1` | Enable/disable oneDNN optimizations |

**`TF_FORCE_BACKEND`**
- **`cpu`**: Pure JavaScript CPU backend. Most compatible, works everywhere.
- **`webgl`**: GPU-accelerated via WebGL. Faster for large models but requires GPU.
- **`wasm`**: WebAssembly backend. Good balance of speed and compatibility.

**`TF_CPP_MIN_LOG_LEVEL`**
- **`0`**: All logs (DEBUG, INFO, WARNING, ERROR)
- **`1`**: INFO and above
- **`2`**: WARNING and above (suppresses most logs)
- **`3`**: ERROR only

**`TF_ENABLE_ONEDNN_OPTS`**
- **`1`**: Enable oneDNN optimizations (faster on Intel CPUs)
- **`0`**: Disable oneDNN (useful if experiencing compatibility issues)

## Debugging

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `DEBUG` | Pattern string | (none) | Enable debug output for specific modules |
| `NO_COLOR` | `1` | (none) | Disable colors in console output |
| `FORCE_COLOR` | `1` | (none) | Force colors in console output |

**`DEBUG`**
```bash
# Enable all boa-parser debug logs
DEBUG=boa-parser:* pnpm parse-boa ./statement.pdf

# Enable specific module debugging
DEBUG=boa-parser:extractor pnpm parse-boa ./statement.pdf

# Multiple patterns
DEBUG=boa-parser:parser,boa-parser:categorizer pnpm parse-boa ./statement.pdf
```

**`NO_COLOR`** - Disables ANSI color codes. Useful for logging to files or CI environments.

**`FORCE_COLOR`** - Forces ANSI color codes even when output is not a TTY. Overrides `NO_COLOR`.

## Complete Example .env

```bash
# .env - Complete example with all CLI options configured

# Input/Output
BOA_INPUT_DIR=C:\Users\YourName\Documents\Statements
BOA_OUTPUT_FILE=result.json
BOA_FORMAT=json

# Parsing
FINAL_RESULT_SCHEMA_VERSION=v2
BOA_VERBOSE=false
BOA_STRICT=false

# ML Categorization
BOA_ML=true
BOA_MODEL_PATH=./models/categorizer

# Runtime
NODE_ENV=production
TF_CPP_MIN_LOG_LEVEL=2
TF_ENABLE_ONEDNN_OPTS=0
```

With this configuration, you can run:
```bash
pnpm parse-boa
```
Instead of:
```bash
pnpm parse-boa --inputDir "C:\Users\YourName\Documents\Statements" --ml --model ./models/categorizer --schema-version v2 --out result.json
```

## CI/CD Environment

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      NODE_ENV: test
      FINAL_RESULT_SCHEMA_VERSION: v2
      TF_CPP_MIN_LOG_LEVEL: 2
    steps:
      - uses: actions/checkout@v4
      - run: pnpm test
```
