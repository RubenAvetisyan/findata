/**
 * Training Data Generator for ML Categorizer
 * 
 * Generates synthetic training examples based on existing rule-based categorization.
 * Uses pattern variations and augmentation to create diverse training data.
 */

import type { Category, Subcategory, ChannelType } from '@findata/types';
import type { TrainingExample } from './ml-categorizer.js';
import { CATEGORY_RULES_V2 } from '@findata/categorizer';

interface MerchantTemplate {
  name: string;
  variations: string[];
  category: Category;
  subcategory: Subcategory;
  channelTypes?: ChannelType[];
}

const MERCHANT_TEMPLATES: MerchantTemplate[] = [
  // Income
  { name: 'PAYROLL', variations: ['PAYROLL DIRECT DEP', 'PAYROLL ACME CORP', 'DIRECT DEPOSIT PAYROLL', 'SALARY DEPOSIT'], category: 'Income', subcategory: 'Salary' },
  { name: 'INTEREST', variations: ['INTEREST EARNED', 'INTEREST PAYMENT', 'INT PAYMENT SAVINGS'], category: 'Income', subcategory: 'Interest' },
  
  // Food & Dining - Restaurants
  { name: 'STARBUCKS', variations: ['STARBUCKS STORE', 'STARBUCKS COFFEE', 'STARBUCKS #12345'], category: 'Food & Dining', subcategory: 'Restaurants' },
  { name: 'MCDONALDS', variations: ['MCDONALD\'S', 'MCDONALDS F12345', 'MCDONALD\'S RESTAURANT'], category: 'Food & Dining', subcategory: 'Restaurants' },
  { name: 'CHIPOTLE', variations: ['CHIPOTLE MEXICAN', 'CHIPOTLE ONLINE', 'CHIPOTLE #1234'], category: 'Food & Dining', subcategory: 'Restaurants' },
  { name: 'SUBWAY', variations: ['SUBWAY #12345', 'SUBWAY SANDWICHES', 'SUBWAY RESTAURANT'], category: 'Food & Dining', subcategory: 'Restaurants' },
  { name: 'TACO BELL', variations: ['TACO BELL #1234', 'TACO BELL RESTAURANT'], category: 'Food & Dining', subcategory: 'Restaurants' },
  { name: 'WENDYS', variations: ['WENDY\'S #1234', 'WENDYS RESTAURANT'], category: 'Food & Dining', subcategory: 'Restaurants' },
  { name: 'CHICK-FIL-A', variations: ['CHICK-FIL-A #1234', 'CHICK FIL A RESTAURANT'], category: 'Food & Dining', subcategory: 'Restaurants' },
  { name: 'PANDA EXPRESS', variations: ['PANDA EXPRESS #1234', 'PANDA EXPRESS RESTAURANT'], category: 'Food & Dining', subcategory: 'Restaurants' },
  { name: 'DUNKIN', variations: ['DUNKIN #12345', 'DUNKIN DONUTS', 'DUNKIN\' DONUTS'], category: 'Food & Dining', subcategory: 'Restaurants' },
  
  // Food & Dining - Groceries
  { name: 'TRADER JOES', variations: ['TRADER JOE\'S #123', 'TRADER JOES', 'TRADER JOE\'S STORE'], category: 'Food & Dining', subcategory: 'Groceries' },
  { name: 'WHOLE FOODS', variations: ['WHOLE FOODS MARKET', 'WHOLE FOODS #123', 'WFM STORE'], category: 'Food & Dining', subcategory: 'Groceries' },
  { name: 'SAFEWAY', variations: ['SAFEWAY #1234', 'SAFEWAY STORE', 'SAFEWAY GROCERY'], category: 'Food & Dining', subcategory: 'Groceries' },
  { name: 'KROGER', variations: ['KROGER #1234', 'KROGER STORE', 'KROGER GROCERY'], category: 'Food & Dining', subcategory: 'Groceries' },
  { name: 'RALPHS', variations: ['RALPHS #1234', 'RALPHS GROCERY'], category: 'Food & Dining', subcategory: 'Groceries' },
  { name: 'VONS', variations: ['VONS #1234', 'VONS GROCERY'], category: 'Food & Dining', subcategory: 'Groceries' },
  { name: 'ALBERTSONS', variations: ['ALBERTSONS #1234', 'ALBERTSONS STORE'], category: 'Food & Dining', subcategory: 'Groceries' },
  { name: 'COSTCO', variations: ['COSTCO WHSE #1234', 'COSTCO WHOLESALE', 'COSTCO GAS'], category: 'Food & Dining', subcategory: 'Groceries' },
  { name: 'ALDI', variations: ['ALDI #1234', 'ALDI STORE'], category: 'Food & Dining', subcategory: 'Groceries' },
  { name: 'SPROUTS', variations: ['SPROUTS FARMERS', 'SPROUTS #1234'], category: 'Food & Dining', subcategory: 'Groceries' },
  
  // Food & Dining - Food Delivery
  { name: 'DOORDASH', variations: ['DOORDASH*ORDER', 'DOORDASH ORDER', 'DD DOORDASH'], category: 'Food & Dining', subcategory: 'Food Delivery' },
  { name: 'UBER EATS', variations: ['UBER EATS ORDER', 'UBER *EATS', 'UBEREATS'], category: 'Food & Dining', subcategory: 'Food Delivery' },
  { name: 'GRUBHUB', variations: ['GRUBHUB ORDER', 'GRUBHUB*', 'GH ORDER'], category: 'Food & Dining', subcategory: 'Food Delivery' },
  { name: 'INSTACART', variations: ['INSTACART ORDER', 'INSTACART*', 'IC ORDER'], category: 'Food & Dining', subcategory: 'Food Delivery' },
  
  // Transportation - Rideshare
  { name: 'UBER', variations: ['UBER *TRIP', 'UBER TRIP', 'UBER *RIDES'], category: 'Transportation', subcategory: 'Rideshare' },
  { name: 'LYFT', variations: ['LYFT *RIDE', 'LYFT RIDE', 'LYFT *'], category: 'Transportation', subcategory: 'Rideshare' },
  
  // Transportation - Gas
  { name: 'CHEVRON', variations: ['CHEVRON #1234', 'CHEVRON STATION', 'CHEVRON GAS'], category: 'Transportation', subcategory: 'Gas' },
  { name: 'SHELL', variations: ['SHELL OIL #1234', 'SHELL SERVICE', 'SHELL GAS'], category: 'Transportation', subcategory: 'Gas' },
  { name: 'EXXON', variations: ['EXXON #1234', 'EXXONMOBIL', 'EXXON STATION'], category: 'Transportation', subcategory: 'Gas' },
  { name: 'ARCO', variations: ['ARCO #1234', 'ARCO AMPM', 'ARCO GAS'], category: 'Transportation', subcategory: 'Gas' },
  { name: '76', variations: ['76 GAS STATION', '76 #1234', 'UNION 76'], category: 'Transportation', subcategory: 'Gas' },
  
  // Shopping - Online
  { name: 'AMAZON', variations: ['AMAZON.COM', 'AMZN MKTP', 'AMAZON PRIME', 'AMZN DIGITAL'], category: 'Shopping', subcategory: 'Online' },
  { name: 'TEMU', variations: ['TEMU.COM', 'TEMU ORDER', 'TEMU*'], category: 'Shopping', subcategory: 'Online' },
  { name: 'SHEIN', variations: ['SHEIN.COM', 'SHEIN ORDER', 'SHEIN*'], category: 'Shopping', subcategory: 'Online' },
  { name: 'EBAY', variations: ['EBAY *', 'EBAY ORDER', 'EBAY.COM'], category: 'Shopping', subcategory: 'Online' },
  { name: 'ETSY', variations: ['ETSY.COM', 'ETSY *', 'ETSY ORDER'], category: 'Shopping', subcategory: 'Online' },
  
  // Shopping - General
  { name: 'TARGET', variations: ['TARGET #1234', 'TARGET STORE', 'TARGET.COM'], category: 'Shopping', subcategory: 'General Merchandise' },
  { name: 'WALMART', variations: ['WALMART #1234', 'WALMART STORE', 'WALMART.COM', 'WAL-MART'], category: 'Shopping', subcategory: 'General Merchandise' },
  
  // Shopping - Electronics
  { name: 'BEST BUY', variations: ['BEST BUY #1234', 'BESTBUY.COM', 'BEST BUY STORE'], category: 'Shopping', subcategory: 'Electronics' },
  { name: 'APPLE', variations: ['APPLE STORE #1234', 'APPLE.COM', 'APPLE ONLINE'], category: 'Shopping', subcategory: 'Electronics' },
  
  // Shopping - Home Improvement
  { name: 'HOME DEPOT', variations: ['HOME DEPOT #1234', 'THE HOME DEPOT', 'HOMEDEPOT.COM'], category: 'Shopping', subcategory: 'Home Improvement' },
  { name: 'LOWES', variations: ['LOWE\'S #1234', 'LOWES HOME', 'LOWES.COM'], category: 'Shopping', subcategory: 'Home Improvement' },
  
  // Entertainment - Streaming
  { name: 'NETFLIX', variations: ['NETFLIX.COM', 'NETFLIX SUBSCRIPTION', 'NETFLIX*'], category: 'Entertainment', subcategory: 'Streaming' },
  { name: 'SPOTIFY', variations: ['SPOTIFY USA', 'SPOTIFY PREMIUM', 'SPOTIFY*'], category: 'Entertainment', subcategory: 'Streaming' },
  { name: 'HULU', variations: ['HULU SUBSCRIPTION', 'HULU*', 'HULU LLC'], category: 'Entertainment', subcategory: 'Streaming' },
  { name: 'DISNEY+', variations: ['DISNEY PLUS', 'DISNEY+ SUBSCRIPTION', 'DISNEYPLUS'], category: 'Entertainment', subcategory: 'Streaming' },
  { name: 'HBO', variations: ['HBO MAX', 'HBO SUBSCRIPTION', 'HBO*'], category: 'Entertainment', subcategory: 'Streaming' },
  { name: 'YOUTUBE', variations: ['YOUTUBE PREMIUM', 'YOUTUBE MUSIC', 'GOOGLE *YOUTUBE'], category: 'Entertainment', subcategory: 'Streaming' },
  
  // Entertainment - Fitness
  { name: 'PLANET FITNESS', variations: ['PLANET FITNESS #1234', 'PLANET FIT', 'PF MEMBERSHIP'], category: 'Entertainment', subcategory: 'Fitness' },
  { name: 'LA FITNESS', variations: ['LA FITNESS #1234', 'LA FITNESS MEMBERSHIP'], category: 'Entertainment', subcategory: 'Fitness' },
  { name: 'EQUINOX', variations: ['EQUINOX #1234', 'EQUINOX MEMBERSHIP'], category: 'Entertainment', subcategory: 'Fitness' },
  
  // Utilities
  { name: 'COMCAST', variations: ['COMCAST CABLE', 'COMCAST XFINITY', 'XFINITY INTERNET'], category: 'Utilities', subcategory: 'Internet' },
  { name: 'SPECTRUM', variations: ['SPECTRUM CABLE', 'SPECTRUM INTERNET', 'CHARTER SPECTRUM'], category: 'Utilities', subcategory: 'Internet' },
  { name: 'T-MOBILE', variations: ['T-MOBILE PAYMENT', 'T-MOBILE WIRELESS', 'TMOBILE*'], category: 'Utilities', subcategory: 'Phone' },
  { name: 'VERIZON', variations: ['VERIZON WIRELESS', 'VERIZON PAYMENT', 'VZW*'], category: 'Utilities', subcategory: 'Phone' },
  { name: 'AT&T', variations: ['AT&T WIRELESS', 'AT&T PAYMENT', 'ATT*'], category: 'Utilities', subcategory: 'Phone' },
  { name: 'PG&E', variations: ['PG&E PAYMENT', 'PACIFIC GAS ELECTRIC', 'PGE BILL'], category: 'Utilities', subcategory: 'Electric' },
  { name: 'EDISON', variations: ['SOUTHERN CALIFORNIA EDISON', 'SCE PAYMENT', 'EDISON BILL'], category: 'Utilities', subcategory: 'Electric' },
  
  // Health
  { name: 'CVS', variations: ['CVS PHARMACY #1234', 'CVS/PHARMACY', 'CVS STORE'], category: 'Health', subcategory: 'Pharmacy' },
  { name: 'WALGREENS', variations: ['WALGREENS #1234', 'WALGREENS PHARMACY', 'WALGREENS STORE'], category: 'Health', subcategory: 'Pharmacy' },
  
  // Financial
  { name: 'ATM', variations: ['BKOFAMERICA ATM', 'ATM WITHDRAWAL', 'ATM WITHDRWL', 'CASH WITHDRAWAL'], category: 'Financial', subcategory: 'ATM', channelTypes: ['ATM_WITHDRAWAL'] },
  { name: 'ZELLE', variations: ['Zelle payment to', 'Zelle payment from', 'ZELLE TRANSFER'], category: 'Transfer', subcategory: 'Zelle', channelTypes: ['ZELLE'] },
  { name: 'VENMO', variations: ['VENMO PAYMENT', 'VENMO CASHOUT', 'VENMO*'], category: 'Transfer', subcategory: 'Venmo' },
  
  // Fees
  { name: 'FEE', variations: ['MONTHLY MAINTENANCE FEE', 'SERVICE CHARGE', 'OVERDRAFT FEE', 'NSF FEE'], category: 'Fees', subcategory: 'Bank' },
  
  // Travel
  { name: 'DELTA', variations: ['DELTA AIR LINES', 'DELTA AIRLINES', 'DELTA.COM'], category: 'Travel', subcategory: 'Flights' },
  { name: 'UNITED', variations: ['UNITED AIRLINES', 'UNITED.COM', 'UNITED AIR'], category: 'Travel', subcategory: 'Flights' },
  { name: 'SOUTHWEST', variations: ['SOUTHWEST AIRLINES', 'SOUTHWEST.COM', 'SWA AIRLINES'], category: 'Travel', subcategory: 'Flights' },
  { name: 'MARRIOTT', variations: ['MARRIOTT HOTEL', 'MARRIOTT BONVOY', 'MARRIOTT #1234'], category: 'Travel', subcategory: 'Lodging' },
  { name: 'HILTON', variations: ['HILTON HOTEL', 'HILTON HONORS', 'HILTON #1234'], category: 'Travel', subcategory: 'Lodging' },
  { name: 'AIRBNB', variations: ['AIRBNB *', 'AIRBNB BOOKING', 'AIRBNB.COM'], category: 'Travel', subcategory: 'Lodging' },
  
  // Education
  { name: 'UDEMY', variations: ['UDEMY.COM', 'UDEMY COURSE', 'UDEMY*'], category: 'Education', subcategory: 'Learning' },
  { name: 'COURSERA', variations: ['COURSERA.ORG', 'COURSERA SUBSCRIPTION', 'COURSERA*'], category: 'Education', subcategory: 'Learning' },
  
  // Software/AI
  { name: 'OPENAI', variations: ['OPENAI *CHATGPT', 'OPENAI API', 'OPENAI.COM'], category: 'Shopping', subcategory: 'Online' },
  { name: 'GITHUB', variations: ['GITHUB.COM', 'GITHUB SUBSCRIPTION', 'GITHUB*'], category: 'Shopping', subcategory: 'Online' },
  { name: 'ADOBE', variations: ['ADOBE CREATIVE', 'ADOBE SYSTEMS', 'ADOBE*'], category: 'Shopping', subcategory: 'Online' },
  { name: 'MICROSOFT', variations: ['MICROSOFT *', 'MICROSOFT 365', 'MSFT*'], category: 'Shopping', subcategory: 'Online' },
];

const CITIES = [
  'LOS ANGELES CA', 'NEW YORK NY', 'CHICAGO IL', 'HOUSTON TX', 'PHOENIX AZ',
  'SAN DIEGO CA', 'DALLAS TX', 'SAN JOSE CA', 'AUSTIN TX', 'SEATTLE WA',
  'DENVER CO', 'BOSTON MA', 'ATLANTA GA', 'MIAMI FL', 'PORTLAND OR',
  'LAS VEGAS NV', 'SACRAMENTO CA', 'FRESNO CA', 'OAKLAND CA', 'GLENDALE CA',
];

const CHECKCARD_PREFIXES = ['CHECKCARD', 'PURCHASE', 'POS', 'DEBIT CARD'];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function generateTraceNumber(): string {
  const digits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
  return digits;
}

function generateStoreNumber(): string {
  return `#${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
}

function augmentDescription(base: string): string {
  const augmentations: Array<(s: string) => string> = [
    (s): string => s,
    (s): string => `${randomElement(CHECKCARD_PREFIXES)} ${s}`,
    (s): string => `${s} ${randomElement(CITIES)}`,
    (s): string => `${s} ${generateStoreNumber()}`,
    (s): string => `${randomElement(CHECKCARD_PREFIXES)} ${s} ${randomElement(CITIES)}`,
    (s): string => `${s} ${generateTraceNumber()}`,
  ];
  
  return randomElement(augmentations)(base);
}

export function generateTrainingData(count: number = 5000): TrainingExample[] {
  const examples: TrainingExample[] = [];
  const examplesPerTemplate = Math.ceil(count / MERCHANT_TEMPLATES.length);
  
  for (const template of MERCHANT_TEMPLATES) {
    for (let i = 0; i < examplesPerTemplate && examples.length < count; i++) {
      const baseVariation = randomElement(template.variations);
      const description = augmentDescription(baseVariation);
      const channelType = template.channelTypes 
        ? randomElement(template.channelTypes)
        : randomElement(['CHECKCARD', 'PURCHASE'] as ChannelType[]);
      
      examples.push({
        description,
        channelType,
        category: template.category,
        subcategory: template.subcategory,
      });
    }
  }
  
  for (const rule of CATEGORY_RULES_V2) {
    const patternStr = rule.patterns[0]?.source ?? '';
    const keywords = patternStr
      .replace(/\\b/g, '')
      .replace(/\\s\*/g, ' ')
      .replace(/\|/g, ',')
      .replace(/[()]/g, '')
      .split(',')
      .filter(k => k.length > 2);
    
    for (const keyword of keywords.slice(0, 3)) {
      if (examples.length >= count) break;
      
      const description = augmentDescription(keyword.toUpperCase());
      const channelType = rule.channelTypes?.[0] ?? 'CHECKCARD';
      
      examples.push({
        description,
        channelType,
        category: rule.category,
        subcategory: rule.subcategory,
      });
    }
  }
  
  return shuffleArray(examples).slice(0, count);
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
  }
  return shuffled;
}

export function generateFromParsedTransactions(
  transactions: Array<{ description: string; channelType?: ChannelType; category: Category; subcategory: Subcategory }>
): TrainingExample[] {
  return transactions.map(t => {
    const example: TrainingExample = {
      description: t.description,
      category: t.category,
      subcategory: t.subcategory,
    };
    if (t.channelType !== undefined) {
      example.channelType = t.channelType;
    }
    return example;
  });
}

export { MERCHANT_TEMPLATES };
