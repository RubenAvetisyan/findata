# Recurring Transaction Detection

The parser can detect recurring transactions such as subscriptions, regular bills, and periodic payments.

## CLI Usage

```bash
# Detect recurring transactions
findata --inputDir ./statements --detect-recurring --out result.json

# With verbose output showing detection stats
findata --inputDir ./statements --detect-recurring --verbose --out result.json
```

### Environment Variable

```bash
# Enable via .env file
BOA_DETECT_RECURRING=true
```

## Detected Frequencies

| Frequency | Interval Range |
|-----------|----------------|
| `weekly` | 5-9 days |
| `bi-weekly` | 12-16 days |
| `monthly` | 26-35 days |
| `quarterly` | 85-100 days |
| `semi-annual` | 170-200 days |
| `annual` | 350-380 days |
| `irregular` | High variance or outside ranges |

## Output Structure

When `--detect-recurring` is enabled, a `recurring` object is added to the JSON output:

```json
{
  "recurring": {
    "patterns": [
      {
        "patternId": "rec_debit_abc123",
        "merchantKey": "netflix",
        "merchantName": "NETFLIX.COM",
        "frequency": "monthly",
        "averageIntervalDays": 30.5,
        "intervalStdDev": 1.2,
        "averageAmount": 15.99,
        "amountVariance": 0,
        "isFixedAmount": true,
        "category": "Entertainment",
        "subcategory": "Streaming",
        "direction": "debit",
        "occurrenceCount": 6,
        "firstSeen": "2025-01-15",
        "lastSeen": "2025-06-15",
        "expectedNext": "2025-07-15",
        "confidence": 0.95,
        "isSubscription": true,
        "transactionIds": ["tx_abc123...", "tx_def456..."]
      }
    ],
    "summary": {
      "totalPatterns": 5,
      "totalRecurringTransactions": 30,
      "recurringPercentage": 15.5,
      "estimatedMonthlyRecurring": 125.50,
      "estimatedAnnualRecurring": 1506.00,
      "byFrequency": {
        "weekly": 0,
        "bi-weekly": 1,
        "monthly": 3,
        "quarterly": 1,
        "semi-annual": 0,
        "annual": 0,
        "irregular": 0
      },
      "subscriptionCount": 3
    }
  }
}
```

## Subscription Detection

The detector identifies likely subscriptions based on:
- **Known services**: Netflix, Spotify, Amazon Prime, Disney+, HBO, Hulu, Apple, Google, Microsoft, Adobe, etc.
- **Keywords**: subscription, membership, premium, monthly, annual
- **Amount stability**: Fixed or near-fixed amounts with low variance

## Confidence Scoring

Pattern confidence is calculated from:
- **Occurrence count**: More occurrences = higher confidence
- **Interval regularity**: Lower standard deviation = higher confidence
- **Amount consistency**: Fixed amounts boost confidence
- **Frequency type**: Regular frequencies (weekly, monthly) score higher than irregular

## Programmatic Usage

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
