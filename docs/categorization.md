# Transaction Categorization

The parser includes both rule-based and ML-based transaction categorization.

## Confidence Tiers

| Tier | Confidence | Description |
|------|------------|-------------|
| HIGH | 0.95 | Exact merchant match (Netflix, Uber, etc.) |
| MEDIUM | 0.75-0.85 | Keyword match with context |
| LOW | 0.50 | Uncategorized (no rule matched) |

## Transaction Categories

The parser includes 70+ priority-ordered categorization rules covering:

| Category | Subcategories |
|----------|---------------|
| Income | Salary, Interest, Dividends, Refund |
| Housing | Rent, Mortgage, HOA, Property Tax |
| Utilities | Electric, Gas, Water, Internet, Phone |
| Transportation | Rideshare, Gas, Parking, Tolls, Insurance |
| Food & Dining | Groceries, Restaurants, Food Delivery, Alcohol |
| Shopping | Online, General Merchandise, Electronics, Clothing |
| Entertainment | Streaming, Movies, Events, Fitness, Gaming |
| Health | Pharmacy, Medical, Dental, Vision, Insurance |
| Financial | ATM, Deposit, Check, Credit Card Payment, Investment, Loan Payment |
| Transfer | Zelle, Venmo, Internal, Wire, ACH |
| Fees | Bank |
| Travel | Flights, Lodging, Car Rental |
| Education | Tuition, Learning |
| Personal Care | Grooming, Beauty |
| Insurance | Life, Renters |
| Taxes | Tax Payment, Tax Preparation |
| Charity | Donation |
| Pets | Pet Care |
| Childcare | Daycare |

Uncategorized transactions receive a confidence score of 0.5.

## Rule-Based Categorization (v2)

The v2 categorizer uses a priority-based rule matching system:

- 70+ rules sorted by priority (lower = higher precedence)
- First matching rule wins
- Three confidence tiers: HIGH (0.95), MEDIUM (0.75-0.85), LOW (0.5)
- Fallback to "Uncategorized" with 0.5 confidence
- Optional channel type filtering per rule

### Features

- Factory function for type-safe rule creation
- Rule IDs for debugging and rationale
- Exclude patterns to prevent false positives
- Channel type constraints for context-aware categorization

## ML-Based Categorization

The parser includes an optional machine learning-based categorizer using TensorFlow.js and Universal Sentence Encoder.

### Architecture

- **Text Embeddings**: Universal Sentence Encoder generates 512-dimensional embeddings from transaction descriptions
- **Neural Network**: Multi-output classifier predicts both category and subcategory
- **Hybrid Approach**: Combines rule-based and ML categorization for best results

### Usage

```typescript
import { HybridCategorizer, generateTrainingData } from 'boa-statement-parser';

// Initialize hybrid categorizer
const categorizer = new HybridCategorizer();
await categorizer.initialize();

// Train with synthetic data (or your own labeled transactions)
const trainingData = generateTrainingData(5000);
await categorizer.trainML(trainingData, { epochs: 50 });

// Categorize with hybrid approach
const result = await categorizer.categorizeAsync('STARBUCKS COFFEE SEATTLE WA', 'CHECKCARD');
console.log(result.category);    // 'Food & Dining'
console.log(result.subcategory); // 'Restaurants'
console.log(result.source);      // 'rule' | 'ml' | 'hybrid'

// Clean up
categorizer.dispose();
```

### Hybrid Strategy

1. **Rule-first**: Fast, deterministic rule-based categorization runs first
2. **High confidence bypass**: If rule confidence ≥ 0.9, use rule result directly
3. **ML validation**: For medium confidence (0.75-0.9), ML validates/overrides
4. **ML fallback**: For uncategorized transactions, ML provides predictions
5. **Confidence combination**: When rule and ML agree, confidences are combined

### Training Data Generation

The `generateTrainingData()` function creates synthetic training examples from:
- 100+ merchant templates across all categories
- Data augmentation (prefixes, cities, store numbers)
- Existing rule-based patterns

```typescript
import { generateTrainingData, generateFromParsedTransactions } from 'boa-statement-parser';

// Generate synthetic training data
const syntheticData = generateTrainingData(5000);

// Or use your own labeled transactions
const customData = generateFromParsedTransactions([
  { description: 'MY LOCAL COFFEE SHOP', category: 'Food & Dining', subcategory: 'Restaurants' },
  // ... more examples
]);
```

### Model Persistence

```typescript
// Save trained model
await categorizer.saveMLModel('./models/categorizer');

// Load pre-trained model
const newCategorizer = new HybridCategorizer();
await newCategorizer.loadMLModel('./models/categorizer');
```

### CLI Training

```bash
# Train ML model using synthetic data only
pnpm parse-boa --train-ml --model-out ./models/categorizer

# Train ML model from your parsed statements (recommended)
pnpm parse-boa --train-ml --inputDir ./statements --model-out ./models/categorizer

# Train with more epochs for better accuracy
pnpm parse-boa --train-ml --inputDir ./statements --model-out ./models/categorizer --epochs 100 --verbose
```

The training process:
1. Parses all PDFs in the input directory
2. Extracts categorized transactions as training examples
3. Augments with synthetic data for better coverage
4. Trains the neural network
5. Saves the model to the specified path

### Performance Notes

- First prediction is slower due to model warm-up
- Batch predictions (`predictBatch`) are more efficient for multiple transactions
- Consider installing `@tensorflow/tfjs-node` for faster CPU inference
