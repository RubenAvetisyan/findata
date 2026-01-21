import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  MLCategorizer,
  CATEGORIES_LIST,
  SUBCATEGORIES_LIST,
  generateTrainingData,
  HybridCategorizer,
  categorizeWithRulesOnly,
} from '../../src/categorization/index.js';
import type { TrainingExample } from '../../src/categorization/index.js';

describe('ML Categorizer', () => {
  describe('MLCategorizer class', () => {
    it('should instantiate with default config', () => {
      const categorizer = new MLCategorizer();
      expect(categorizer).toBeDefined();
      categorizer.dispose();
    });

    it('should instantiate with custom config', () => {
      const categorizer = new MLCategorizer({
        embeddingDim: 512,
        hiddenUnits: [128, 64],
        dropoutRate: 0.2,
        minConfidenceThreshold: 0.7,
      });
      expect(categorizer).toBeDefined();
      categorizer.dispose();
    });

    it('should build model architecture', () => {
      const categorizer = new MLCategorizer();
      const model = categorizer.buildModel();
      expect(model).toBeDefined();
      
      const summary = categorizer.getModelSummary();
      expect(summary).toContain('embedding_input');
      expect(summary).toContain('channel_input');
      expect(summary).toContain('category_output');
      expect(summary).toContain('subcategory_output');
      
      categorizer.dispose();
    });

    it('should throw error when predicting without trained model', async () => {
      const categorizer = new MLCategorizer();
      await expect(categorizer.predict('STARBUCKS COFFEE')).rejects.toThrow('Model not trained');
      categorizer.dispose();
    });
  });

  describe('CATEGORIES_LIST and SUBCATEGORIES_LIST', () => {
    it('should have all expected categories', () => {
      expect(CATEGORIES_LIST).toContain('Income');
      expect(CATEGORIES_LIST).toContain('Food & Dining');
      expect(CATEGORIES_LIST).toContain('Transportation');
      expect(CATEGORIES_LIST).toContain('Shopping');
      expect(CATEGORIES_LIST).toContain('Entertainment');
      expect(CATEGORIES_LIST).toContain('Financial');
      expect(CATEGORIES_LIST).toContain('Uncategorized');
    });

    it('should have all expected subcategories', () => {
      expect(SUBCATEGORIES_LIST).toContain('Salary');
      expect(SUBCATEGORIES_LIST).toContain('Groceries');
      expect(SUBCATEGORIES_LIST).toContain('Restaurants');
      expect(SUBCATEGORIES_LIST).toContain('Rideshare');
      expect(SUBCATEGORIES_LIST).toContain('Online');
      expect(SUBCATEGORIES_LIST).toContain('ATM');
      expect(SUBCATEGORIES_LIST).toContain(null);
    });
  });
});

describe('Training Data Generator', () => {
  describe('generateTrainingData', () => {
    it('should generate specified number of examples', () => {
      const examples = generateTrainingData(100);
      expect(examples.length).toBeLessThanOrEqual(100);
      expect(examples.length).toBeGreaterThan(0);
    });

    it('should generate valid training examples', () => {
      const examples = generateTrainingData(50);
      
      for (const example of examples) {
        expect(example.description).toBeDefined();
        expect(typeof example.description).toBe('string');
        expect(example.description.length).toBeGreaterThan(0);
        
        expect(example.category).toBeDefined();
        expect(CATEGORIES_LIST).toContain(example.category);
        
        expect(SUBCATEGORIES_LIST).toContain(example.subcategory);
      }
    });

    it('should include diverse categories', () => {
      const examples = generateTrainingData(500);
      const categories = new Set(examples.map(e => e.category));
      
      expect(categories.size).toBeGreaterThan(5);
    });

    it('should include channel types', () => {
      const examples = generateTrainingData(100);
      const withChannelType = examples.filter(e => e.channelType !== undefined);
      
      expect(withChannelType.length).toBeGreaterThan(0);
    });
  });
});

describe('Hybrid Categorizer', () => {
  describe('categorizeWithRulesOnly', () => {
    it('should categorize using rules only', () => {
      const result = categorizeWithRulesOnly('STARBUCKS COFFEE SEATTLE WA');
      expect(result.category).toBe('Food & Dining');
      expect(result.subcategory).toBe('Restaurants');
    });

    it('should return Uncategorized for unknown descriptions', () => {
      const result = categorizeWithRulesOnly('XYZABC123 UNKNOWN MERCHANT');
      expect(result.category).toBe('Uncategorized');
    });
  });

  describe('HybridCategorizer class', () => {
    it('should instantiate with default config', () => {
      const categorizer = new HybridCategorizer();
      expect(categorizer).toBeDefined();
      expect(categorizer.isReady()).toBe(false);
      categorizer.dispose();
    });

    it('should use rule-based categorization when ML not ready', () => {
      const categorizer = new HybridCategorizer();
      
      const result = categorizer.categorize('UBER *TRIP ABC123');
      expect(result.category).toBe('Transportation');
      expect(result.subcategory).toBe('Rideshare');
      expect(result.source).toBe('rule');
      
      categorizer.dispose();
    });

    it('should handle high confidence rule matches', () => {
      const categorizer = new HybridCategorizer();
      
      const result = categorizer.categorize('NETFLIX.COM SUBSCRIPTION');
      expect(result.category).toBe('Entertainment');
      expect(result.subcategory).toBe('Streaming');
      expect(result.source).toBe('rule');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      
      categorizer.dispose();
    });

    it('should include rule result in output', () => {
      const categorizer = new HybridCategorizer();
      
      const result = categorizer.categorize('DOORDASH*ORDER 123456');
      expect(result.ruleResult).toBeDefined();
      expect(result.ruleResult?.category).toBe('Food & Dining');
      
      categorizer.dispose();
    });
  });
});

describe('ML Categorizer Integration', () => {
  let categorizer: MLCategorizer;
  
  beforeAll(async () => {
    categorizer = new MLCategorizer({
      minConfidenceThreshold: 0.5,
    });
  });

  afterAll(() => {
    categorizer.dispose();
  });

  it('should have correct category count', () => {
    expect(CATEGORIES_LIST.length).toBe(20);
  });

  it('should have correct subcategory count', () => {
    expect(SUBCATEGORIES_LIST.length).toBeGreaterThan(50);
  });

  it('should generate training data with correct structure', () => {
    const examples: TrainingExample[] = generateTrainingData(10);
    
    expect(examples.length).toBe(10);
    examples.forEach(example => {
      expect(example).toHaveProperty('description');
      expect(example).toHaveProperty('category');
      expect(example).toHaveProperty('subcategory');
    });
  });
});
