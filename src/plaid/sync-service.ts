/**
 * Unified Plaid Sync Service.
 * Combines cursor-based sync, rate limiting, retry logic, and Supabase persistence.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlaidTransaction, PlaidItem } from './types.js';
import type { PlaidWebhookPayload, WebhookHandlerResult } from './webhooks.js';
import type { RetryOptions } from './retry.js';
import { syncAllTransactions } from './transactions.js';
import { SupabasePlaidItemStore, type PlaidItemStore } from './store.js';
import { RateLimiter, withRetry } from './retry.js';
import { handleWebhook } from './webhooks.js';
import { upsertTransactions, type TransactionInput } from '../supabase/import.js';

export interface SyncServiceConfig {
  supabaseClient: SupabaseClient;
  userId: string;
  rateLimitTokens?: number;
  rateLimitRefillRate?: number;
  retryOptions?: RetryOptions;
  onProgress?: (event: SyncProgressEvent) => void;
}

export interface ScheduledSyncConfig {
  intervalMs: number;
  onSyncComplete?: (results: SyncResult[]) => void;
  onSyncError?: (error: Error) => void;
  runImmediately?: boolean;
}

export interface ScheduledSyncStatus {
  isRunning: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalRuns: number;
  consecutiveErrors: number;
}

export type SyncPhase = 'fetching' | 'importing' | 'complete' | 'error';

export interface SyncProgressEvent {
  itemId: string;
  phase: SyncPhase;
  added: number;
  modified: number;
  removed: number;
  error?: Error | undefined;
}

export interface SyncResult {
  itemId: string;
  transactionsInserted: number;
  transactionsSkipped: number;
  transactionsRemoved: number;
  finalCursor: string;
  duration: number;
}

export interface SyncStatus {
  itemId: string;
  lastSyncAt: string | null;
  syncCursor: string | null;
  status: PlaidItem['status'];
}

export class PlaidSyncService {
  private readonly supabaseClient: SupabaseClient<any, any, any>;
  private readonly userId: string;
  private readonly store: PlaidItemStore;
  private readonly rateLimiter: RateLimiter;
  private readonly retryOptions: RetryOptions;
  private readonly onProgress: ((event: SyncProgressEvent) => void) | undefined;

  private scheduledSyncTimer: ReturnType<typeof setInterval> | null = null;
  private scheduledSyncConfig: ScheduledSyncConfig | null = null;
  private scheduledSyncLastRunAt: string | null = null;
  private scheduledSyncTotalRuns = 0;
  private scheduledSyncConsecutiveErrors = 0;

  constructor(config: SyncServiceConfig) {
    this.supabaseClient = config.supabaseClient as SupabaseClient<any, any, any>;
    this.userId = config.userId;
    this.store = new SupabasePlaidItemStore(this.supabaseClient);
    this.rateLimiter = new RateLimiter(
      config.rateLimitTokens ?? 10,
      config.rateLimitRefillRate ?? 5
    );
    this.retryOptions = config.retryOptions ?? {};
    this.onProgress = config.onProgress;
  }

  /**
   * Sync a single Plaid item with rate limiting, retry, and Supabase import.
   */
  async syncItem(itemId: string): Promise<SyncResult> {
    const startTime = Date.now();

    const item = await this.store.getItem(itemId);
    if (item === null) {
      throw new Error(`Plaid item not found: ${itemId}`);
    }

    // Emit fetching progress
    this.emitProgress(itemId, 'fetching', 0, 0, 0);

    // Rate limit and retry the Plaid API call
    await this.rateLimiter.acquire();

    let added: PlaidTransaction[] = [];
    let modified: PlaidTransaction[] = [];
    let removed: { transactionId: string }[] = [];
    let finalCursor = '';

    try {
      const syncResult = await withRetry(
        () => syncAllTransactions(item.accessToken, item.syncCursor),
        this.retryOptions
      );

      added = syncResult.added;
      modified = syncResult.modified;
      removed = syncResult.removed;
      finalCursor = syncResult.finalCursor;
    } catch (error) {
      this.emitProgress(itemId, 'error', 0, 0, 0, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    // Emit importing progress
    this.emitProgress(itemId, 'importing', added.length, modified.length, removed.length);

    // Get account ID for this item (use first account)
    const accountId = await this.getAccountIdForItem(item);

    // Convert Plaid transactions to Supabase format
    const allTransactions = [...added, ...modified];
    const transactionInputs = this.mapPlaidToSupabase(allTransactions);

    // Upsert to Supabase
    const upsertResult = await upsertTransactions(
      this.supabaseClient,
      this.userId,
      {
        accountId,
        transactions: transactionInputs as any,
      }
    );

    // Handle removed transactions (mark as deleted or actually delete)
    const removedCount = await this.handleRemovedTransactions(removed);

    // Update sync cursor in store
    await this.store.updateSyncCursor(itemId, finalCursor);

    const duration = Date.now() - startTime;

    // Emit complete progress
    this.emitProgress(itemId, 'complete', added.length, modified.length, removed.length);

    return {
      itemId,
      transactionsInserted: upsertResult.inserted,
      transactionsSkipped: upsertResult.skipped,
      transactionsRemoved: removedCount,
      finalCursor,
      duration,
    };
  }

  /**
   * Sync all Plaid items for the configured user.
   */
  async syncAllItems(): Promise<SyncResult[]> {
    const items = await this.store.getItemsByUserId(this.userId);

    if (items.length === 0) {
      return [];
    }

    // Sync items with rate limiting (sequential to respect rate limits)
    const results: SyncResult[] = [];
    const errors: Array<{ itemId: string; error: Error }> = [];

    for (const item of items) {
      // Skip items that need re-authentication
      if (item.status === 'login_required' || item.status === 'error') {
        continue;
      }

      try {
        const result = await this.syncItem(item.itemId);
        results.push(result);
      } catch (error) {
        errors.push({
          itemId: item.itemId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    // Log errors but don't fail the entire batch
    if (errors.length > 0) {
      console.error(`Sync errors for ${errors.length} items:`, errors);
    }

    return results;
  }

  /**
   * Handle a Plaid webhook and trigger sync if needed.
   */
  async handleWebhook(payload: PlaidWebhookPayload): Promise<WebhookHandlerResult> {
    const result = await handleWebhook(payload, {
      onSyncAvailable: async (itemId, _newCount) => {
        await this.syncItem(itemId);
      },
      onTransactionsRemoved: async (itemId, transactionIds) => {
        await this.handleRemovedTransactions(
          transactionIds.map((id) => ({ transactionId: id }))
        );
        // Also trigger a sync to get any new transactions
        await this.syncItem(itemId);
      },
    }, this.store);

    return result;
  }

  /**
   * Get sync status for a specific item.
   */
  async getSyncStatus(itemId: string): Promise<SyncStatus> {
    const item = await this.store.getItem(itemId);

    if (item === null) {
      throw new Error(`Plaid item not found: ${itemId}`);
    }

    return {
      itemId: item.itemId,
      lastSyncAt: item.lastSyncAt ?? null,
      syncCursor: item.syncCursor ?? null,
      status: item.status,
    };
  }

  /**
   * Start scheduled sync with configurable interval.
   * Syncs all items for the user at the specified interval.
   */
  startScheduledSync(config: ScheduledSyncConfig): void {
    if (this.scheduledSyncTimer !== null) {
      throw new Error('Scheduled sync is already running. Call stopScheduledSync() first.');
    }

    this.scheduledSyncConfig = config;

    const runSync = async (): Promise<void> => {
      try {
        const results = await this.syncAllItems();
        this.scheduledSyncLastRunAt = new Date().toISOString();
        this.scheduledSyncTotalRuns++;
        this.scheduledSyncConsecutiveErrors = 0;

        if (config.onSyncComplete !== undefined) {
          config.onSyncComplete(results);
        }
      } catch (error) {
        this.scheduledSyncConsecutiveErrors++;
        if (config.onSyncError !== undefined) {
          config.onSyncError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };

    // Run immediately if configured
    if (config.runImmediately === true) {
      void runSync();
    }

    // Set up interval
    this.scheduledSyncTimer = setInterval(() => {
      void runSync();
    }, config.intervalMs);
  }

  /**
   * Stop scheduled sync.
   */
  stopScheduledSync(): void {
    if (this.scheduledSyncTimer !== null) {
      clearInterval(this.scheduledSyncTimer);
      this.scheduledSyncTimer = null;
    }
    this.scheduledSyncConfig = null;
  }

  /**
   * Check if scheduled sync is running.
   */
  isScheduledSyncRunning(): boolean {
    return this.scheduledSyncTimer !== null;
  }

  /**
   * Get scheduled sync status.
   */
  getScheduledSyncStatus(): ScheduledSyncStatus {
    const isRunning = this.scheduledSyncTimer !== null;
    const intervalMs = this.scheduledSyncConfig?.intervalMs ?? 0;

    let nextRunAt: string | null = null;
    if (isRunning && this.scheduledSyncLastRunAt !== null && intervalMs > 0) {
      const lastRun = new Date(this.scheduledSyncLastRunAt);
      nextRunAt = new Date(lastRun.getTime() + intervalMs).toISOString();
    } else if (isRunning && intervalMs > 0) {
      // First run hasn't happened yet
      nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    }

    return {
      isRunning,
      intervalMs,
      lastRunAt: this.scheduledSyncLastRunAt,
      nextRunAt,
      totalRuns: this.scheduledSyncTotalRuns,
      consecutiveErrors: this.scheduledSyncConsecutiveErrors,
    };
  }

  /**
   * Map Plaid transactions to Supabase transaction input format.
   */
  private mapPlaidToSupabase(transactions: PlaidTransaction[]): TransactionInput[] {
    return transactions.map((tx) => {
      // Plaid amounts: positive = money out (debit), negative = money in (credit)
      const isDebit = tx.amount > 0;
      const direction: 'debit' | 'credit' = isDebit ? 'debit' : 'credit';

      const result: TransactionInput = {
        transactionId: `plaid-${tx.transactionId}`,
        date: tx.date,
        postedDate: tx.authorizedDate ?? null,
        amount: Math.abs(tx.amount),
        direction,
        description: tx.name,
        descriptionRaw: tx.name,
        merchant: {
          name: tx.merchantName ?? null,
          entityId: tx.merchantEntityId ?? null,
        },
        channel: {
          type: tx.paymentChannel,
        },
        confidence: tx.personalFinanceCategory?.confidenceLevel === 'VERY_HIGH'
          ? 0.95
          : tx.personalFinanceCategory?.confidenceLevel === 'HIGH'
            ? 0.85
            : tx.personalFinanceCategory?.confidenceLevel === 'MEDIUM'
              ? 0.7
              : 0.5,
        raw: {
          plaidTransactionId: tx.transactionId,
          plaidAccountId: tx.accountId,
          pending: tx.pending,
          location: tx.location,
          paymentMeta: tx.paymentMeta,
          category: tx.category,
          categoryId: tx.categoryId,
        },
      };

      if (tx.personalFinanceCategory?.primary !== undefined) {
        result.category = tx.personalFinanceCategory.primary;
      }
      if (tx.personalFinanceCategory?.detailed !== undefined) {
        result.subcategory = tx.personalFinanceCategory.detailed;
      }

      return result;
    });
  }

  /**
   * Handle removed transactions by marking them as deleted in Supabase.
   */
  private async handleRemovedTransactions(
    removed: Array<{ transactionId: string }>
  ): Promise<number> {
    if (removed.length === 0) {
      return 0;
    }

    const transactionIds = removed.map((r) => `plaid-${r.transactionId}`);

    // Soft delete by setting a flag (or hard delete if preferred)
    const { error, count } = await this.supabaseClient
      .from('transactions')
      .update({ flags: { deleted: true, deletedAt: new Date().toISOString() } })
      .eq('user_id', this.userId)
      .in('transaction_id', transactionIds);

    if (error !== null) {
      console.error('Failed to mark transactions as deleted:', error);
      return 0;
    }

    return count ?? 0;
  }

  /**
   * Get or create account ID for a Plaid item.
   */
  private async getAccountIdForItem(item: PlaidItem): Promise<string> {
    // Try to find existing account by institution
    const { data: existing } = await this.supabaseClient
      .from('accounts')
      .select('id')
      .eq('user_id', this.userId)
      .eq('institution', item.institutionName)
      .limit(1)
      .single();

    if (existing !== null) {
      return existing.id as string;
    }

    // Create new account
    const { data: newAccount, error } = await this.supabaseClient
      .from('accounts')
      .insert({
        user_id: this.userId,
        institution: item.institutionName,
        account_type: 'checking', // Default, will be updated on first transaction
        account_number_masked: '****',
        currency: 'USD',
      })
      .select('id')
      .single();

    if (error !== null) {
      throw new Error(`Failed to create account: ${error.message}`);
    }

    return newAccount.id as string;
  }

  /**
   * Emit progress event if handler is configured.
   */
  private emitProgress(
    itemId: string,
    phase: SyncPhase,
    added: number,
    modified: number,
    removed: number,
    error?: Error | undefined
  ): void {
    if (this.onProgress !== undefined) {
      const event: SyncProgressEvent = {
        itemId,
        phase,
        added,
        modified,
        removed,
      };
      if (error !== undefined) {
        event.error = error;
      }
      this.onProgress(event);
    }
  }
}

/**
 * Create a PlaidSyncService instance.
 */
export function createSyncService(config: SyncServiceConfig): PlaidSyncService {
  return new PlaidSyncService(config);
}
