/**
 * PlaidItemStore interface — extracted into @findata/types to break
 * the plaid-bridge ↔ store circular dependency.
 */

import type { PlaidItem, PlaidItemStatus } from './types.js';

export interface PlaidItemStore {
  getItem(itemId: string): Promise<PlaidItem | null>;
  getItemByAccessToken(accessToken: string): Promise<PlaidItem | null>;
  getItemsByUserId(userId: string): Promise<PlaidItem[]>;
  saveItem(item: PlaidItem): Promise<void>;
  updateItem(itemId: string, updates: Partial<PlaidItem>): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  updateSyncCursor(itemId: string, cursor: string): Promise<void>;
  updateStatus(itemId: string, status: PlaidItemStatus): Promise<void>;
}
