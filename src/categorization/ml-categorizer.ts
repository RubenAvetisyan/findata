/**
 * ML-based Categorizer using TensorFlow.js and Universal Sentence Encoder
 * 
 * This module provides machine learning-based transaction categorization
 * using text embeddings and a trained classifier. It works alongside the
 * rule-based categorizer-v2 in a hybrid approach.
 * 
 * Architecture:
 * 1. Text preprocessing and normalization
 * 2. Universal Sentence Encoder for 512-dim embeddings
 * 3. Dense neural network classifier
 * 4. Confidence calibration
 */

import * as tf from '@tensorflow/tfjs';
import { writeFile, readFile, mkdir } from 'fs/promises';
import type { Category, Subcategory, ChannelType } from '../types/output.js';
import type { CategorizationResult } from './categorizer-v2.js';

interface UniversalSentenceEncoder {
  embed(sentences: string[]): Promise<tf.Tensor2D>;
}

export interface MLCategorizationResult extends CategorizationResult {
  mlConfidence: number;
  embedding?: number[];
}

export interface TrainingExample {
  description: string;
  channelType?: ChannelType;
  category: Category;
  subcategory: Subcategory;
}

export interface MLCategorizerConfig {
  modelPath?: string;
  embeddingDim: number;
  hiddenUnits: number[];
  dropoutRate: number;
  minConfidenceThreshold: number;
}

const DEFAULT_CONFIG: MLCategorizerConfig = {
  embeddingDim: 512,
  hiddenUnits: [256, 128, 64],
  dropoutRate: 0.3,
  minConfidenceThreshold: 0.6,
};

const CATEGORIES: Category[] = [
  'Income', 'Housing', 'Utilities', 'Transportation', 'Food & Dining',
  'Shopping', 'Entertainment', 'Health', 'Financial', 'Transfer',
  'Fees', 'Travel', 'Education', 'Personal Care', 'Insurance',
  'Taxes', 'Charity', 'Pets', 'Childcare', 'Uncategorized',
];

const SUBCATEGORIES: Subcategory[] = [
  'Salary', 'Interest', 'Dividends', 'Refund', 'Transfer',
  'Rent', 'Mortgage', 'HOA', 'Property Tax',
  'Electric', 'Gas', 'Water', 'Internet', 'Phone',
  'Rideshare', 'Public Transit', 'Parking', 'Tolls', 'Insurance', 'Registration',
  'Groceries', 'Restaurants', 'Food Delivery', 'Alcohol',
  'Online', 'General Merchandise', 'Electronics', 'Clothing', 'Home Improvement', 'Convenience Store',
  'Streaming', 'Movies', 'Events', 'Fitness', 'Gaming',
  'Pharmacy', 'Medical', 'Dental', 'Vision',
  'ATM', 'Deposit', 'Fees', 'Credit Card Payment', 'Investment', 'Cash Advance', 'Payment', 'Loan Payment', 'Check',
  'Zelle', 'Venmo', 'Wire', 'ACH', 'Internal', 'Bank',
  'Flights', 'Lodging', 'Car Rental',
  'Tuition', 'Learning', 'Certification',
  'Grooming', 'Beauty',
  'Life', 'Renters',
  'Tax Payment', 'Tax Preparation',
  'Donation',
  'Pet Care',
  'Daycare',
  null,
];

const CHANNEL_TYPES: ChannelType[] = [
  'CHECKCARD', 'PURCHASE', 'ATM_DEPOSIT', 'ATM_WITHDRAWAL',
  'FINANCIAL_CENTER_DEPOSIT', 'ONLINE_BANKING_TRANSFER', 'ZELLE', 'CHECK', 'FEE', 'OTHER',
];

export class MLCategorizer {
  private model: tf.LayersModel | null = null;
  private encoder: UniversalSentenceEncoder | null = null;
  private config: MLCategorizerConfig;
  private isInitialized = false;
  private categoryIndex: Map<Category, number>;
  private subcategoryIndex: Map<Subcategory, number>;
  private channelIndex: Map<ChannelType, number>;

  constructor(config: Partial<MLCategorizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.categoryIndex = new Map(CATEGORIES.map((c, i) => [c, i]));
    this.subcategoryIndex = new Map(SUBCATEGORIES.map((s, i) => [s, i]));
    this.channelIndex = new Map(CHANNEL_TYPES.map((c, i) => [c, i]));
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const use = await import('@tensorflow-models/universal-sentence-encoder');
      this.encoder = await use.load() as UniversalSentenceEncoder;
      this.isInitialized = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize ML categorizer: ${errorMessage}`);
    }
  }

  private preprocessDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/\d{2}\/\d{2}\/?\d{0,4}/g, '') // Remove dates
      .replace(/\*+\d+/g, '') // Remove masked numbers
      .replace(/\b\d{10,}\b/g, '') // Remove long numbers (trace numbers)
      .replace(/\b[A-Z0-9]{20,}\b/gi, '') // Remove long alphanumeric codes
      .replace(/\s+/g, ' ')
      .trim();
  }

  async getEmbedding(text: string): Promise<tf.Tensor2D> {
    if (this.encoder === null) {
      throw new Error('Encoder not initialized. Call initialize() first.');
    }
    const processed = this.preprocessDescription(text);
    return await this.encoder.embed([processed]);
  }

  async getEmbeddings(texts: string[]): Promise<tf.Tensor2D> {
    if (this.encoder === null) {
      throw new Error('Encoder not initialized. Call initialize() first.');
    }
    const processed = texts.map(t => this.preprocessDescription(t));
    return await this.encoder.embed(processed);
  }

  private encodeChannelType(channelType?: ChannelType): number[] {
    const oneHot: number[] = Array.from({ length: CHANNEL_TYPES.length }, () => 0);
    if (channelType) {
      const idx = this.channelIndex.get(channelType);
      if (idx !== undefined) {
        oneHot[idx] = 1;
      }
    }
    return oneHot;
  }

  buildModel(): tf.LayersModel {
    const embeddingInput = tf.input({ shape: [this.config.embeddingDim], name: 'embedding_input' });
    const channelInput = tf.input({ shape: [CHANNEL_TYPES.length], name: 'channel_input' });

    const concatenated = tf.layers.concatenate().apply([embeddingInput, channelInput]) as tf.SymbolicTensor;

    let x: tf.SymbolicTensor = concatenated;
    for (const units of this.config.hiddenUnits) {
      x = tf.layers.dense({ units, activation: 'relu' }).apply(x) as tf.SymbolicTensor;
      x = tf.layers.dropout({ rate: this.config.dropoutRate }).apply(x) as tf.SymbolicTensor;
      x = tf.layers.batchNormalization().apply(x) as tf.SymbolicTensor;
    }

    const categoryOutput = tf.layers.dense({
      units: CATEGORIES.length,
      activation: 'softmax',
      name: 'category_output',
    }).apply(x) as tf.SymbolicTensor;

    const subcategoryOutput = tf.layers.dense({
      units: SUBCATEGORIES.length,
      activation: 'softmax',
      name: 'subcategory_output',
    }).apply(x) as tf.SymbolicTensor;

    const model = tf.model({
      inputs: [embeddingInput, channelInput],
      outputs: [categoryOutput, subcategoryOutput],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: {
        category_output: 'categoricalCrossentropy',
        subcategory_output: 'categoricalCrossentropy',
      },
      metrics: ['accuracy'],
    });

    this.model = model;
    return model;
  }

  async train(
    examples: TrainingExample[],
    options: { epochs?: number; batchSize?: number; validationSplit?: number } = {}
  ): Promise<tf.History> {
    const { epochs = 50, batchSize = 32, validationSplit = 0.2 } = options;

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.model) {
      this.buildModel();
    }

    const descriptions = examples.map(e => e.description);
    const embeddings = await this.getEmbeddings(descriptions);

    const channelFeatures = tf.tensor2d(
      examples.map(e => this.encodeChannelType(e.channelType))
    );

    const categoryLabels = tf.tensor2d(
      examples.map(e => {
        const oneHot: number[] = Array.from({ length: CATEGORIES.length }, () => 0);
        const idx = this.categoryIndex.get(e.category);
        if (idx !== undefined) oneHot[idx] = 1;
        return oneHot;
      })
    );

    const subcategoryLabels = tf.tensor2d(
      examples.map(e => {
        const oneHot: number[] = Array.from({ length: SUBCATEGORIES.length }, () => 0);
        const idx = this.subcategoryIndex.get(e.subcategory);
        if (idx !== undefined) oneHot[idx] = 1;
        return oneHot;
      })
    );

    const history = await this.model!.fit(
      [embeddings, channelFeatures],
      [categoryLabels, subcategoryLabels],
      {
        epochs,
        batchSize,
        validationSplit,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              const loss = typeof logs?.['loss'] === 'number' ? logs['loss'] : undefined;
              const accuracy = typeof logs?.['category_output_accuracy'] === 'number' ? logs['category_output_accuracy'] : undefined;
              // eslint-disable-next-line no-console
              console.log(`Epoch ${epoch}: loss = ${loss?.toFixed(4) ?? 'N/A'}, accuracy = ${accuracy?.toFixed(4) ?? 'N/A'}`);
            }
          },
        },
      }
    );

    embeddings.dispose();
    channelFeatures.dispose();
    categoryLabels.dispose();
    subcategoryLabels.dispose();

    return history;
  }

  async predict(description: string, channelType?: ChannelType): Promise<MLCategorizationResult> {
    if (!this.model) {
      throw new Error('Model not trained. Call train() first or load a pre-trained model.');
    }

    const embedding = await this.getEmbedding(description);
    const channelFeature = tf.tensor2d([this.encodeChannelType(channelType)]);

    const predictions = this.model.predict([embedding, channelFeature]) as tf.Tensor[];
    const categoryProbs = predictions[0];
    const subcategoryProbs = predictions[1];

    if (!categoryProbs || !subcategoryProbs) {
      throw new Error('Model prediction failed');
    }

    const categoryData = Array.from(await categoryProbs.data());
    const subcategoryData = Array.from(await subcategoryProbs.data());

    const categoryIdx = categoryData.indexOf(Math.max(...categoryData));
    const subcategoryIdx = subcategoryData.indexOf(Math.max(...subcategoryData));

    const categoryConfidence = categoryData[categoryIdx] ?? 0;
    const subcategoryConfidence = subcategoryData[subcategoryIdx] ?? 0;

    const category = CATEGORIES[categoryIdx] ?? 'Uncategorized';
    const subcategory = SUBCATEGORIES[subcategoryIdx] ?? null;

    const combinedConfidence = (categoryConfidence + subcategoryConfidence) / 2;

    embedding.dispose();
    channelFeature.dispose();
    categoryProbs.dispose();
    subcategoryProbs.dispose();

    if (combinedConfidence < this.config.minConfidenceThreshold) {
      return {
        category: 'Uncategorized',
        subcategory: null,
        confidence: combinedConfidence,
        mlConfidence: combinedConfidence,
        ruleId: null,
        rationale: `ML confidence ${(combinedConfidence * 100).toFixed(1)}% below threshold`,
      };
    }

    return {
      category,
      subcategory,
      confidence: combinedConfidence,
      mlConfidence: combinedConfidence,
      ruleId: 'ml-classifier',
      rationale: `ML prediction: ${category}/${subcategory} (${(combinedConfidence * 100).toFixed(1)}%)`,
    };
  }

  async predictBatch(
    descriptions: string[],
    channelTypes?: (ChannelType | undefined)[]
  ): Promise<MLCategorizationResult[]> {
    if (!this.model) {
      throw new Error('Model not trained. Call train() first or load a pre-trained model.');
    }

    const embeddings = await this.getEmbeddings(descriptions);
    const channelFeatures = tf.tensor2d(
      descriptions.map((_, i) => this.encodeChannelType(channelTypes?.[i]))
    );

    const predictions = this.model.predict([embeddings, channelFeatures]) as tf.Tensor[];
    const categoryProbs = predictions[0];
    const subcategoryProbs = predictions[1];

    if (!categoryProbs || !subcategoryProbs) {
      throw new Error('Model prediction failed');
    }

    const categoryData = await categoryProbs.array() as number[][];
    const subcategoryData = await subcategoryProbs.array() as number[][];

    const results: MLCategorizationResult[] = [];

    for (let i = 0; i < descriptions.length; i++) {
      const catProbs = categoryData[i] ?? [];
      const subProbs = subcategoryData[i] ?? [];

      const categoryIdx = catProbs.indexOf(Math.max(...catProbs));
      const subcategoryIdx = subProbs.indexOf(Math.max(...subProbs));

      const categoryConfidence = catProbs[categoryIdx] ?? 0;
      const subcategoryConfidence = subProbs[subcategoryIdx] ?? 0;
      const combinedConfidence = (categoryConfidence + subcategoryConfidence) / 2;

      if (combinedConfidence < this.config.minConfidenceThreshold) {
        results.push({
          category: 'Uncategorized',
          subcategory: null,
          confidence: combinedConfidence,
          mlConfidence: combinedConfidence,
          ruleId: null,
          rationale: `ML confidence ${(combinedConfidence * 100).toFixed(1)}% below threshold`,
        });
      } else {
        results.push({
          category: CATEGORIES[categoryIdx] ?? 'Uncategorized',
          subcategory: SUBCATEGORIES[subcategoryIdx] ?? null,
          confidence: combinedConfidence,
          mlConfidence: combinedConfidence,
          ruleId: 'ml-classifier',
          rationale: `ML prediction (${(combinedConfidence * 100).toFixed(1)}%)`,
        });
      }
    }

    embeddings.dispose();
    channelFeatures.dispose();
    categoryProbs.dispose();
    subcategoryProbs.dispose();

    return results;
  }

  async saveModel(path: string): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }
    
    // Ensure directory exists
    await mkdir(path, { recursive: true });
    
    // Save model using custom IOHandler for Node.js
    const saveResult = await this.model.save(tf.io.withSaveHandler(async (artifacts) => {
      // Save model topology
      const modelJson = {
        modelTopology: artifacts.modelTopology,
        weightsManifest: [{
          paths: ['weights.bin'],
          weights: artifacts.weightSpecs,
        }],
        format: artifacts.format,
        generatedBy: artifacts.generatedBy,
        convertedBy: artifacts.convertedBy,
      };
      
      await writeFile(`${path}/model.json`, JSON.stringify(modelJson, null, 2));
      
      // Save weights as binary
      if (artifacts.weightData) {
        let weightData: Uint8Array;
        if (artifacts.weightData instanceof ArrayBuffer) {
          weightData = new Uint8Array(artifacts.weightData);
        } else {
          // Handle ArrayBuffer[] case by concatenating
          const buffers = artifacts.weightData;
          const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
          weightData = new Uint8Array(totalLength);
          let offset = 0;
          for (const buf of buffers) {
            weightData.set(new Uint8Array(buf), offset);
            offset += buf.byteLength;
          }
        }
        await writeFile(`${path}/weights.bin`, weightData);
      }
      
      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: 'JSON',
        },
      };
    }));
    
    void saveResult;
  }

  async loadModel(path: string): Promise<void> {
    // Load model JSON and weights from disk
    const modelJsonStr = await readFile(`${path}/model.json`, 'utf-8');
    const modelJson = JSON.parse(modelJsonStr) as {
      modelTopology: object;
      weightsManifest: Array<{ paths: string[]; weights: tf.io.WeightsManifestEntry[] }>;
    };
    
    // Load weights
    const weightsBuffer = await readFile(`${path}/weights.bin`);
    const weightData = new Uint8Array(weightsBuffer).buffer;
    
    // Create model artifacts object for tf.io.fromMemory
    const modelArtifacts: tf.io.ModelArtifacts = {
      modelTopology: modelJson.modelTopology,
      weightSpecs: modelJson.weightsManifest[0]?.weights ?? [],
      weightData,
    };
    
    // Load model from memory using the new single-argument API
    this.model = await tf.loadLayersModel(tf.io.fromMemory(modelArtifacts));
    
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  getModelSummary(): string {
    if (!this.model) {
      return 'Model not built';
    }
    const lines: string[] = [];
    this.model.summary(undefined, undefined, (line: string) => lines.push(line));
    return lines.join('\n');
  }

  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.isInitialized = false;
  }
}

export const CATEGORIES_LIST = CATEGORIES;
export const SUBCATEGORIES_LIST = SUBCATEGORIES;
