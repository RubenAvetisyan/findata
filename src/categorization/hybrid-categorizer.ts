/**
 * Hybrid Categorizer - Combines rule-based and ML-based categorization
 * 
 * Strategy:
 * 1. First try rule-based categorization (fast, deterministic)
 * 2. If rule-based confidence is HIGH (>= 0.9), use it directly
 * 3. If rule-based confidence is MEDIUM (0.75-0.9), use ML to validate/override
 * 4. If rule-based returns Uncategorized, use ML prediction
 * 5. Combine confidences using weighted average
 */

import type { ChannelType } from '../types/output.js';
import { categorizeTransaction as categorizeRuleBased, type CategorizationResult } from './categorizer-v2.js';
import { MLCategorizer, type MLCategorizationResult, type TrainingExample } from './ml-categorizer.js';

export interface HybridCategorizationResult extends CategorizationResult {
  source: 'rule' | 'ml' | 'hybrid';
  ruleResult?: CategorizationResult;
  mlResult?: MLCategorizationResult;
}

export interface HybridCategorizerConfig {
  ruleHighConfidenceThreshold: number;
  ruleMediumConfidenceThreshold: number;
  mlWeight: number;
  ruleWeight: number;
  useMLForValidation: boolean;
  useMLForUncategorized: boolean;
}

const DEFAULT_CONFIG: HybridCategorizerConfig = {
  ruleHighConfidenceThreshold: 0.9,
  ruleMediumConfidenceThreshold: 0.75,
  mlWeight: 0.4,
  ruleWeight: 0.6,
  useMLForValidation: true,
  useMLForUncategorized: true,
};

export class HybridCategorizer {
  private mlCategorizer: MLCategorizer;
  private config: HybridCategorizerConfig;
  private isMLReady = false;

  constructor(config: Partial<HybridCategorizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mlCategorizer = new MLCategorizer();
  }

  async initialize(): Promise<void> {
    await this.mlCategorizer.initialize();
  }

  async trainML(examples: TrainingExample[], options?: { epochs?: number; batchSize?: number }): Promise<void> {
    await this.mlCategorizer.train(examples, options);
    this.isMLReady = true;
  }

  async loadMLModel(path: string): Promise<void> {
    await this.mlCategorizer.loadModel(path);
    this.isMLReady = true;
  }

  async saveMLModel(path: string): Promise<void> {
    await this.mlCategorizer.saveModel(path);
  }

  categorize(description: string, channelType?: ChannelType): HybridCategorizationResult {
    const ruleResult = categorizeRuleBased(description, channelType);

    if (ruleResult.confidence >= this.config.ruleHighConfidenceThreshold) {
      return {
        ...ruleResult,
        source: 'rule',
        ruleResult,
      };
    }

    if (!this.isMLReady) {
      return {
        ...ruleResult,
        source: 'rule',
        ruleResult,
      };
    }

    return {
      ...ruleResult,
      source: 'rule',
      ruleResult,
    };
  }

  async categorizeAsync(description: string, channelType?: ChannelType): Promise<HybridCategorizationResult> {
    const ruleResult = categorizeRuleBased(description, channelType);

    if (ruleResult.confidence >= this.config.ruleHighConfidenceThreshold) {
      return {
        ...ruleResult,
        source: 'rule',
        ruleResult,
      };
    }

    if (!this.isMLReady) {
      return {
        ...ruleResult,
        source: 'rule',
        ruleResult,
      };
    }

    const mlResult = await this.mlCategorizer.predict(description, channelType);

    if (ruleResult.category === 'Uncategorized' && this.config.useMLForUncategorized) {
      if (mlResult.confidence >= 0.6) {
        return {
          category: mlResult.category,
          subcategory: mlResult.subcategory,
          confidence: mlResult.confidence,
          ruleId: mlResult.ruleId,
          rationale: `ML prediction (rule returned Uncategorized): ${mlResult.rationale}`,
          source: 'ml',
          ruleResult,
          mlResult,
        };
      }
    }

    if (this.config.useMLForValidation && ruleResult.confidence < this.config.ruleHighConfidenceThreshold) {
      if (mlResult.category === ruleResult.category) {
        const combinedConfidence = 
          ruleResult.confidence * this.config.ruleWeight + 
          mlResult.confidence * this.config.mlWeight;
        
        return {
          category: ruleResult.category,
          subcategory: ruleResult.subcategory,
          confidence: Math.min(combinedConfidence, 0.98),
          ruleId: ruleResult.ruleId,
          rationale: `Hybrid (rule + ML agree): ${ruleResult.rationale}`,
          source: 'hybrid',
          ruleResult,
          mlResult,
        };
      }

      if (mlResult.confidence > ruleResult.confidence + 0.15) {
        return {
          category: mlResult.category,
          subcategory: mlResult.subcategory,
          confidence: mlResult.confidence * 0.9,
          ruleId: mlResult.ruleId,
          rationale: `ML override (higher confidence): ${mlResult.rationale}`,
          source: 'ml',
          ruleResult,
          mlResult,
        };
      }
    }

    return {
      ...ruleResult,
      source: 'rule',
      ruleResult,
      mlResult,
    };
  }

  async categorizeBatchAsync(
    descriptions: string[],
    channelTypes?: (ChannelType | undefined)[]
  ): Promise<HybridCategorizationResult[]> {
    const results: HybridCategorizationResult[] = [];
    
    const ruleResults = descriptions.map((desc, i) => 
      categorizeRuleBased(desc, channelTypes?.[i])
    );

    if (!this.isMLReady) {
      return ruleResults.map(ruleResult => ({
        ...ruleResult,
        source: 'rule' as const,
        ruleResult,
      }));
    }

    const needsML = ruleResults.map((r, i) => ({
      index: i,
      needsML: r.confidence < this.config.ruleHighConfidenceThreshold || r.category === 'Uncategorized',
    }));

    const mlIndices = needsML.filter(n => n.needsML).map(n => n.index);
    
    let mlResults: MLCategorizationResult[] = [];
    if (mlIndices.length > 0) {
      const mlDescriptions = mlIndices.map(i => descriptions[i] ?? '');
      const mlChannelTypes = mlIndices.map(i => channelTypes?.[i]);
      mlResults = await this.mlCategorizer.predictBatch(mlDescriptions, mlChannelTypes);
    }

    let mlResultIndex = 0;
    for (let i = 0; i < descriptions.length; i++) {
      const ruleResult = ruleResults[i];
      if (!ruleResult) continue;

      if (ruleResult.confidence >= this.config.ruleHighConfidenceThreshold) {
        results.push({
          ...ruleResult,
          source: 'rule',
          ruleResult,
        });
        continue;
      }

      const mlResult = mlResults[mlResultIndex];
      mlResultIndex++;

      if (!mlResult) {
        results.push({
          ...ruleResult,
          source: 'rule',
          ruleResult,
        });
        continue;
      }

      if (ruleResult.category === 'Uncategorized' && mlResult.confidence >= 0.6) {
        results.push({
          category: mlResult.category,
          subcategory: mlResult.subcategory,
          confidence: mlResult.confidence,
          ruleId: mlResult.ruleId,
          rationale: `ML prediction: ${mlResult.rationale}`,
          source: 'ml',
          ruleResult,
          mlResult,
        });
      } else if (mlResult.category === ruleResult.category) {
        const combinedConfidence = 
          ruleResult.confidence * this.config.ruleWeight + 
          mlResult.confidence * this.config.mlWeight;
        
        results.push({
          category: ruleResult.category,
          subcategory: ruleResult.subcategory,
          confidence: Math.min(combinedConfidence, 0.98),
          ruleId: ruleResult.ruleId,
          rationale: `Hybrid: ${ruleResult.rationale}`,
          source: 'hybrid',
          ruleResult,
          mlResult,
        });
      } else {
        results.push({
          ...ruleResult,
          source: 'rule',
          ruleResult,
          mlResult,
        });
      }
    }

    return results;
  }

  isReady(): boolean {
    return this.isMLReady;
  }

  getMLModelSummary(): string {
    return this.mlCategorizer.getModelSummary();
  }

  dispose(): void {
    this.mlCategorizer.dispose();
    this.isMLReady = false;
  }
}

export function categorizeWithRulesOnly(description: string, channelType?: ChannelType): CategorizationResult {
  return categorizeRuleBased(description, channelType);
}
