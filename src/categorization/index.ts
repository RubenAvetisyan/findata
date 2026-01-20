export { categorizeTransaction as categorizeTransactionLegacy, extractMerchant, getMerchantConfidence } from './categorizer.js';
export { CATEGORY_RULES, DEFAULT_CATEGORY, DEFAULT_CONFIDENCE } from './categories.js';
export type { CategoryRule } from './categories.js';
export type { CategorizationResult } from './categorizer.js';

export { 
  categorizeTransaction,
  CATEGORY_RULES_V2,
  DEFAULT_CATEGORY as DEFAULT_CATEGORY_V2,
  DEFAULT_CONFIDENCE as DEFAULT_CONFIDENCE_V2,
  getCategoryRuleById,
  getRulesByCategory,
} from './categorizer-v2.js';
export type { CategoryRule as CategoryRuleV2, CategorizationResult as CategorizationResultV2 } from './categorizer-v2.js';
