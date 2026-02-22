/**
 * Plaid SDK-dependent types that require the 'plaid' package.
 * SDK-independent types (PlaidItem, PlaidTransaction, etc.) are in @findata/types.
 */

import type { Products, CountryCode } from 'plaid';

export type { PlaidEnvironment } from '@findata/types';

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: 'sandbox' | 'production';
  webhookUrl?: string;
  redirectUri?: string;
}

export interface CreateLinkTokenOptions {
  userId: string;
  products?: Products[];
  countryCodes?: CountryCode[];
  language?: string;
  webhookUrl?: string;
  redirectUri?: string;
  accessToken?: string;
}

export interface CreateLinkTokenResult {
  linkToken: string;
  expiration: string;
  requestId: string;
}

export interface ExchangePublicTokenResult {
  accessToken: string;
  itemId: string;
  requestId: string;
}
