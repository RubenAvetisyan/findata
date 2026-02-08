# Channel Types & Bank References

The parser detects and classifies transaction channels, and extracts bank-specific reference numbers.

## Channel Types

| Channel Type | Description | Example |
|--------------|-------------|---------|
| `CHECKCARD` | Debit card purchases | `CHECKCARD 0105 STARBUCKS...` |
| `ATM_DEPOSIT` | ATM cash/check deposits | `BKOFAMERICA ATM #000009733 DEPOSIT` |
| `ATM_WITHDRAWAL` | ATM cash withdrawals | `BKOFAMERICA ATM WITHDRWL` |
| `ONLINE_BANKING_TRANSFER` | Online transfers | `Online Banking transfer from SAV Confirmation#...` |
| `ZELLE` | Zelle payments | `Zelle payment from JOHN DOE Conf#...` |
| `CHECK` | Check payments | Check number extracted |
| `FEE` | Bank fees | `Monthly Maintenance Fee` |
| `FINANCIAL_CENTER_DEPOSIT` | Branch deposits | `FINANCIAL CENTER DEPOSIT` |
| `OTHER` | Unclassified | Fallback |

## Bank References

The parser extracts the following reference identifiers from transaction descriptions:

| Reference | Description | Source |
|-----------|-------------|--------|
| `cardTransactionTraceNumber` | 17-25 digit trace number | CHECKCARD transactions only |
| `confirmationNumber` | Online banking confirmation | Online transfers |
| `zelleConfirmation` | Zelle Conf# code | Zelle payments |
| `atmId` | ATM machine ID | ATM transactions |
| `checkNumber` | Check number | Check payments |

### Output Example

```json
{
  "channel": {
    "type": "CHECKCARD",
    "subtype": null
  },
  "bankReference": {
    "cardTransactionTraceNumber": "24801975260482319110911",
    "confirmationNumber": null,
    "zelleConfirmation": null,
    "atmId": null,
    "checkNumber": null
  }
}
```

> **Note**: Bank reference numbers are stored for traceability but are **never** used for categorization decisions.
