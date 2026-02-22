// ML-based categorization
export { 
  MLCategorizer,
  CATEGORIES_LIST,
  SUBCATEGORIES_LIST,
} from './ml-categorizer.js';
export type { 
  MLCategorizationResult, 
  TrainingExample, 
  MLCategorizerConfig,
} from './ml-categorizer.js';

// Hybrid categorization (rule + ML)
export { 
  HybridCategorizer,
  categorizeWithRulesOnly,
} from './hybrid-categorizer.js';
export type { 
  HybridCategorizationResult, 
  HybridCategorizerConfig,
} from './hybrid-categorizer.js';

// Training data generation
export { 
  generateTrainingData,
  generateFromParsedTransactions,
  MERCHANT_TEMPLATES,
} from './training-data-generator.js';
