/**
 * Categorizer v2 - Rule-based categorization with DSL, priority, and confidence tiers.
 * 
 * Confidence Tiers:
 * - HIGH (0.9-0.95): Exact merchant match or very specific pattern
 * - MEDIUM (0.75-0.85): Keyword match with good context
 * - LOW (0.5): Uncategorized / weak match
 * 
 * IMPORTANT: Categorization NEVER uses cardTransactionTraceNumber or other bank reference numbers.
 */

import type { Category, Subcategory, ChannelType } from '@findata/types';

export interface CategoryRule {
  id: string;
  priority: number;
  patterns: RegExp[];
  category: Category;
  subcategory: Subcategory;
  confidence: number;
  excludePatterns?: RegExp[];
  channelTypes?: ChannelType[];
}

export interface CategorizationResult {
  category: Category;
  subcategory: Subcategory;
  confidence: number;
  ruleId: string | null;
  rationale: string | null;
}

const CONFIDENCE = {
  HIGH: 0.95,
  MEDIUM_HIGH: 0.85,
  MEDIUM: 0.75,
  LOW: 0.5,
} as const;

function createRule(
  id: string,
  priority: number,
  patterns: RegExp[],
  category: Category,
  subcategory: Subcategory,
  confidence: number,
  options?: { excludePatterns?: RegExp[]; channelTypes?: ChannelType[] }
): CategoryRule {
  return { id, priority, patterns, category, subcategory, confidence, ...options };
}

const rules: CategoryRule[] = [
  // INCOME
  createRule('income-payroll', 100, [/\b(payroll|direct\s*dep|salary|wages)\b/i], 'Income', 'Salary', CONFIDENCE.HIGH),
  createRule('income-interest', 101, [/\b(interest\s*earned|interest\s*paid|interest\s*payment|int\s*payment)\b/i], 'Income', 'Interest', CONFIDENCE.HIGH),
  createRule('income-dividend', 102, [/\b(dividend|divd|div\s*payment)\b/i], 'Income', 'Dividends', CONFIDENCE.MEDIUM_HIGH),
  createRule('income-refund', 103, [/\b(refund|rebate|credit\s*adj)\b/i], 'Income', 'Refund', CONFIDENCE.MEDIUM_HIGH),
  createRule('income-zelle-from', 104, [/zelle.*(?:from|received)/i, /zelle\s+payment\s+from/i], 'Transfer', 'Zelle', CONFIDENCE.MEDIUM_HIGH, { channelTypes: ['ZELLE'] }),
  createRule('income-venmo-from', 105, [/venmo.*(?:from|received|cashout)/i], 'Transfer', 'Venmo', CONFIDENCE.MEDIUM, { channelTypes: ['ZELLE'] }),
  // HOUSING
  createRule('housing-rent', 200, [/\b(rent|lease\s*payment|apt\s*rent)\b/i], 'Housing', 'Rent', CONFIDENCE.MEDIUM_HIGH),
  createRule('housing-mortgage', 201, [/\b(mortgage|home\s*loan|mtg\s*pmt)\b/i], 'Housing', 'Mortgage', CONFIDENCE.HIGH),
  createRule('housing-hoa', 202, [/\b(hoa|homeowner.*assoc|condo\s*fee)\b/i], 'Housing', 'HOA', CONFIDENCE.MEDIUM_HIGH),
  createRule('housing-property-tax', 203, [/\b(property\s*tax|prop\s*tax)\b/i], 'Housing', 'Property Tax', CONFIDENCE.MEDIUM_HIGH),
  // UTILITIES
  createRule('util-electric', 300, [/\b(electric|power|energy|edison|pge|pg&e|sce|ladwp)\b/i], 'Utilities', 'Electric', CONFIDENCE.MEDIUM_HIGH, { excludePatterns: [/car|vehicle|auto/i] }),
  createRule('util-gas', 301, [/\b(gas\s*company|natural\s*gas|socal\s*gas|socalgas)\b/i], 'Utilities', 'Gas', CONFIDENCE.MEDIUM_HIGH),
  createRule('util-water', 302, [/\b(water|sewer|dwp|glendale.*water|gwp)\b/i], 'Utilities', 'Water', CONFIDENCE.MEDIUM_HIGH),
  createRule('util-internet', 303, [/\b(internet|comcast|xfinity|spectrum|att\s*internet|verizon\s*fios|frontier)\b/i], 'Utilities', 'Internet', CONFIDENCE.MEDIUM_HIGH),
  createRule('util-phone', 304, [/\b(t-mobile|at&t|verizon\s*wireless|sprint|cricket|metro\s*pcs|boost\s*mobile)\b/i], 'Utilities', 'Phone', CONFIDENCE.MEDIUM_HIGH),
  // TRANSPORTATION
  createRule('trans-rideshare', 400, [/\b(uber|lyft)\b/i], 'Transportation', 'Rideshare', CONFIDENCE.HIGH, { excludePatterns: [/eats|food/i] }),
  createRule('trans-taxi', 401, [/\b(taxi|cab|yellow\s*cab)\b/i], 'Transportation', 'Rideshare', CONFIDENCE.MEDIUM_HIGH),
  createRule('trans-transit', 402, [/\b(metro|tap|transit|mta|bart|caltrain|amtrak|metrolink|bus\s*pass)\b/i], 'Transportation', 'Public Transit', CONFIDENCE.MEDIUM_HIGH),
  createRule('trans-gas-station', 403, [/\b(chevron|shell|exxon|mobil|arco|76|texaco|bp|speedway|wawa|sheetz|racetrac|quiktrip)\b/i], 'Transportation', 'Gas', CONFIDENCE.MEDIUM_HIGH),
  createRule('trans-parking', 404, [/\b(parking|park\s*meter|paybyphone|parkwhiz|spothero)\b/i], 'Transportation', 'Parking', CONFIDENCE.MEDIUM_HIGH),
  createRule('trans-toll', 405, [/\b(toll|fastrak|ezpass|sunpass|peach\s*pass)\b/i], 'Transportation', 'Tolls', CONFIDENCE.MEDIUM_HIGH),
  createRule('trans-auto-ins', 406, [/\b(auto\s*insurance|car\s*insurance|geico|progressive|allstate|state\s*farm|farmers|usaa)\b/i], 'Transportation', 'Insurance', CONFIDENCE.MEDIUM_HIGH),
  createRule('trans-dmv', 407, [/\b(dmv|registration|vehicle\s*reg)\b/i], 'Transportation', 'Registration', CONFIDENCE.MEDIUM_HIGH),
  // FOOD & DINING
  createRule('food-grocery', 500, [/\b(grocery|safeway|trader\s*joe|whole\s*foods|kroger|ralphs|vons|albertsons|publix|heb|wegmans|aldi|sprouts|food\s*4\s*less)\b/i], 'Food & Dining', 'Groceries', CONFIDENCE.MEDIUM_HIGH),
  createRule('food-costco', 501, [/\bcostco\b/i], 'Food & Dining', 'Groceries', CONFIDENCE.MEDIUM),
  createRule('food-restaurant', 502, [/\b(restaurant|cafe|coffee|starbucks|dunkin|mcdonald|burger|pizza|chipotle|subway|taco\s*bell|wendy|chick-fil-a|panda\s*express|in-n-out|five\s*guys|shake\s*shack)\b/i], 'Food & Dining', 'Restaurants', CONFIDENCE.MEDIUM_HIGH),
  createRule('food-pizzeria', 503, [/\b(pizzeria|deli|bakery|bagel|donut|doughnut)\b/i], 'Food & Dining', 'Restaurants', CONFIDENCE.MEDIUM_HIGH),
  createRule('food-ice-cream', 504, [/\b(haagen-dazs|baskin|ice\s*cream|frozen\s*yogurt|coldstone)\b/i], 'Food & Dining', 'Restaurants', CONFIDENCE.MEDIUM_HIGH),
  createRule('food-delivery', 505, [/\b(doordash|grubhub|uber\s*eats|postmates|seamless|instacart|gopuff)\b/i], 'Food & Dining', 'Food Delivery', CONFIDENCE.HIGH),
  createRule('food-alcohol', 506, [/\b(bar|pub|brewery|wine|liquor|spirits|tavern|lounge)\b/i], 'Food & Dining', 'Alcohol', CONFIDENCE.MEDIUM),
  // SHOPPING
  createRule('shop-amazon', 600, [/\b(amazon|amzn)\b/i], 'Shopping', 'Online', CONFIDENCE.MEDIUM_HIGH),
  createRule('shop-online', 601, [/\b(temu|shein|aliexpress|ebay|etsy|wayfair)\b/i], 'Shopping', 'Online', CONFIDENCE.MEDIUM_HIGH),
  createRule('shop-tiktok', 602, [/\b(tiktok\s*shop|tiktok)\b/i], 'Shopping', 'Online', CONFIDENCE.MEDIUM_HIGH),
  createRule('shop-general', 603, [/\b(target|walmart|sam's\s*club|bj's)\b/i], 'Shopping', 'General Merchandise', CONFIDENCE.MEDIUM),
  createRule('shop-electronics', 604, [/\b(best\s*buy|apple\s*store|micro\s*center|fry's|newegg)\b/i], 'Shopping', 'Electronics', CONFIDENCE.MEDIUM_HIGH),
  createRule('shop-home', 605, [/\b(home\s*depot|lowes|lowe's|ace\s*hardware|menards|ikea|bed\s*bath)\b/i], 'Shopping', 'Home Improvement', CONFIDENCE.MEDIUM_HIGH),
  createRule('shop-clothing', 606, [/\b(nordstrom|macy|bloomingdale|gap|old\s*navy|h&m|zara|uniqlo|ross|tj\s*maxx|marshalls)\b/i], 'Shopping', 'Clothing', CONFIDENCE.MEDIUM_HIGH),
  createRule('shop-convenience', 607, [/\b(7-eleven|7\s*eleven|circle\s*k|am\/?pm|wawa|sheetz|quickchek)\b/i], 'Shopping', 'Convenience Store', CONFIDENCE.MEDIUM),
  // ENTERTAINMENT
  createRule('ent-streaming', 700, [/\b(netflix|hulu|disney\+?|hbo|max|spotify|apple\s*music|youtube\s*premium|paramount|peacock|amazon\s*prime\s*video)\b/i], 'Entertainment', 'Streaming', CONFIDENCE.HIGH),
  createRule('ent-movies', 701, [/\b(movie|cinema|amc|regal|cinemark|theater|theatre)\b/i], 'Entertainment', 'Movies', CONFIDENCE.MEDIUM_HIGH),
  createRule('ent-events', 702, [/\b(concert|ticketmaster|stubhub|eventbrite|live\s*nation|axs|seatgeek)\b/i], 'Entertainment', 'Events', CONFIDENCE.MEDIUM_HIGH),
  createRule('ent-fitness', 703, [/\b(gym|fitness|planet\s*fitness|24\s*hour|equinox|la\s*fitness|orangetheory|crossfit|ymca)\b/i], 'Entertainment', 'Fitness', CONFIDENCE.MEDIUM_HIGH),
  createRule('ent-gaming', 704, [/\b(playstation|xbox|steam|nintendo|epic\s*games|riot|blizzard)\b/i], 'Entertainment', 'Gaming', CONFIDENCE.MEDIUM_HIGH),
  // SOFTWARE -> SHOPPING
  createRule('soft-ai', 750, [/\b(openai|chatgpt|anthropic|claude|midjourney)\b/i], 'Shopping', 'Online', CONFIDENCE.HIGH),
  createRule('soft-dev', 751, [/\b(windsurf|github|gitlab|vercel|netlify|heroku|digitalocean|aws|azure|gcp)\b/i], 'Shopping', 'Online', CONFIDENCE.MEDIUM_HIGH),
  createRule('soft-productivity', 752, [/\b(adobe|microsoft|office\s*365|google\s*workspace|dropbox|icloud|notion|slack)\b/i], 'Shopping', 'Online', CONFIDENCE.MEDIUM_HIGH),
  createRule('soft-google', 753, [/\bgoogle\s*\*/i], 'Shopping', 'Online', CONFIDENCE.MEDIUM_HIGH),
  createRule('soft-vpn', 754, [/\b(vpn|nordvpn|expressvpn|surfshark|proton)\b/i], 'Shopping', 'Online', CONFIDENCE.MEDIUM_HIGH),
  // HEALTH
  createRule('health-pharmacy', 800, [/\b(pharmacy|cvs|walgreens|rite\s*aid|prescription|rx)\b/i], 'Health', 'Pharmacy', CONFIDENCE.MEDIUM_HIGH),
  createRule('health-medical', 801, [/\b(doctor|physician|medical|clinic|hospital|urgent\s*care|labcorp|quest\s*diag)\b/i], 'Health', 'Medical', CONFIDENCE.MEDIUM),
  createRule('health-dental', 802, [/\b(dentist|dental|orthodont)\b/i], 'Health', 'Dental', CONFIDENCE.MEDIUM_HIGH),
  createRule('health-vision', 803, [/\b(vision|optometrist|eye\s*doctor|glasses|contacts|lenscrafters)\b/i], 'Health', 'Vision', CONFIDENCE.MEDIUM_HIGH),
  createRule('health-insurance', 804, [/\b(health\s*insurance|medical\s*insurance|anthem|kaiser|blue\s*cross|aetna|cigna|united\s*health)\b/i], 'Health', 'Insurance', CONFIDENCE.MEDIUM_HIGH),
  // FINANCIAL
  createRule('fin-atm', 900, [/\b(atm|cash\s*withdrawal|withdraw|withdrwl)\b/i], 'Financial', 'ATM', CONFIDENCE.HIGH, { channelTypes: ['ATM_WITHDRAWAL', 'ATM_DEPOSIT'] }),
  createRule('fin-deposit', 901, [/\b(deposit|cash\s*deposit)\b/i], 'Financial', 'Deposit', CONFIDENCE.MEDIUM_HIGH, { channelTypes: ['ATM_DEPOSIT', 'FINANCIAL_CENTER_DEPOSIT'] }),
  createRule('fin-check', 902, [/\bcheck\s*#?\d+\b/i], 'Financial', 'Check', CONFIDENCE.HIGH, { channelTypes: ['CHECK'] }),
  createRule('fin-transfer', 903, [/\b(transfer|xfer)\b/i], 'Transfer', 'Internal', CONFIDENCE.MEDIUM, { channelTypes: ['ONLINE_BANKING_TRANSFER'] }),
  createRule('fin-zelle-to', 904, [/zelle.*(?:to|sent|payment\s+to)/i], 'Transfer', 'Zelle', CONFIDENCE.MEDIUM_HIGH, { channelTypes: ['ZELLE'] }),
  createRule('fin-cash-advance', 905, [/\b(klover|dave|earnin|brigit|cash\s*advance|empower)\b/i], 'Financial', 'Cash Advance', CONFIDENCE.MEDIUM_HIGH),
  createRule('fin-payment', 906, [/\b(chime|pmnt\s*sent|venmo.*(?:to|sent))\b/i], 'Financial', 'Payment', CONFIDENCE.MEDIUM_HIGH),
  createRule('fin-fee', 907, [/\b(fee|service\s*charge|monthly\s*maintenance|overdraft|nsf)\b/i], 'Fees', 'Bank', CONFIDENCE.HIGH),
  createRule('fin-cc-payment', 908, [/\b(credit\s*card\s*payment|card\s*payment|cc\s*payment)\b/i], 'Financial', 'Credit Card Payment', CONFIDENCE.MEDIUM_HIGH),
  createRule('fin-loan', 909, [/\b(loan\s*payment|student\s*loan|auto\s*loan|car\s*payment)\b/i], 'Financial', 'Loan Payment', CONFIDENCE.MEDIUM_HIGH),
  createRule('fin-investment', 910, [/\b(investment|brokerage|fidelity|schwab|vanguard|robinhood|etrade|td\s*ameritrade)\b/i], 'Financial', 'Investment', CONFIDENCE.MEDIUM_HIGH),
  // TRAVEL
  createRule('travel-airline', 1000, [/\b(airline|flight|delta|united|american\s*airlines|southwest|jetblue|alaska\s*air|spirit|frontier)\b/i], 'Travel', 'Flights', CONFIDENCE.MEDIUM_HIGH),
  createRule('travel-hotel', 1001, [/\b(hotel|marriott|hilton|hyatt|airbnb|vrbo|motel|inn|resort|booking\.com|expedia)\b/i], 'Travel', 'Lodging', CONFIDENCE.MEDIUM_HIGH),
  createRule('travel-car-rental', 1002, [/\b(car\s*rental|hertz|enterprise|avis|budget|national|alamo|turo)\b/i], 'Travel', 'Car Rental', CONFIDENCE.MEDIUM_HIGH),
  // EDUCATION
  createRule('edu-tuition', 1100, [/\b(tuition|university|college|school)\b/i], 'Education', 'Tuition', CONFIDENCE.MEDIUM_HIGH),
  createRule('edu-learning', 1101, [/\b(udemy|coursera|skillshare|masterclass|linkedin\s*learning|pluralsight)\b/i], 'Education', 'Learning', CONFIDENCE.MEDIUM),
  createRule('edu-cert', 1102, [/\b(psi\s*exams|exam|certification|test\s*center|prometric)\b/i], 'Education', 'Certification', CONFIDENCE.MEDIUM_HIGH),
  // PERSONAL CARE
  createRule('care-grooming', 1200, [/\b(salon|haircut|barber|spa|massage|nail|wax)\b/i], 'Personal Care', 'Grooming', CONFIDENCE.MEDIUM_HIGH),
  createRule('care-beauty', 1201, [/\b(sephora|ulta|beauty|cosmetic|skincare)\b/i], 'Personal Care', 'Beauty', CONFIDENCE.MEDIUM_HIGH),
  // INSURANCE
  createRule('ins-life', 1300, [/\b(life\s*insurance|term\s*life|whole\s*life)\b/i], 'Insurance', 'Life', CONFIDENCE.MEDIUM_HIGH),
  createRule('ins-renters', 1301, [/\b(renter.*insurance|renters)\b/i], 'Insurance', 'Renters', CONFIDENCE.MEDIUM_HIGH),
  // TAXES
  createRule('tax-payment', 1400, [/\b(irs|tax\s*payment|federal\s*tax|state\s*tax|eftps)\b/i], 'Taxes', 'Tax Payment', CONFIDENCE.MEDIUM_HIGH),
  createRule('tax-prep', 1401, [/\b(turbotax|h&r\s*block|tax\s*prep|taxact|freetaxusa)\b/i], 'Taxes', 'Tax Preparation', CONFIDENCE.MEDIUM_HIGH),
  // CHARITY
  createRule('charity-donation', 1500, [/\b(donation|charity|nonprofit|foundation|red\s*cross|united\s*way|gofundme)\b/i], 'Charity', 'Donation', CONFIDENCE.MEDIUM_HIGH),
  // PETS
  createRule('pets-care', 1600, [/\b(pet|petco|petsmart|veterinar|vet\s*clinic|chewy)\b/i], 'Pets', 'Pet Care', CONFIDENCE.MEDIUM_HIGH),
  // CHILDCARE
  createRule('child-daycare', 1700, [/\b(daycare|childcare|babysit|nanny|kindercare|bright\s*horizons)\b/i], 'Childcare', 'Daycare', CONFIDENCE.MEDIUM_HIGH),
].sort((a, b) => a.priority - b.priority);

export const CATEGORY_RULES_V2: CategoryRule[] = rules;

export const DEFAULT_CATEGORY: Category = 'Uncategorized';
export const DEFAULT_SUBCATEGORY: Subcategory = null;
export const DEFAULT_CONFIDENCE = CONFIDENCE.LOW;

export function categorizeTransaction(
  description: string,
  channelType?: ChannelType
): CategorizationResult {
  const normalizedDesc = description.toLowerCase().trim();
  
  for (const rule of rules) {
    if (rule.channelTypes !== undefined && channelType !== undefined) {
      if (!rule.channelTypes.includes(channelType)) {
        continue;
      }
    }
    
    if (rule.excludePatterns !== undefined) {
      const excluded = rule.excludePatterns.some((p) => p.test(normalizedDesc));
      if (excluded) continue;
    }
    
    const matched = rule.patterns.some((p) => p.test(normalizedDesc));
    if (matched) {
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        confidence: rule.confidence,
        ruleId: rule.id,
        rationale: `Matched rule: ${rule.id}`,
      };
    }
  }
  
  return {
    category: DEFAULT_CATEGORY,
    subcategory: DEFAULT_SUBCATEGORY,
    confidence: DEFAULT_CONFIDENCE,
    ruleId: null,
    rationale: 'No matching rule found',
  };
}

export function getCategoryRuleById(id: string): CategoryRule | undefined {
  return CATEGORY_RULES_V2.find((r) => r.id === id);
}

export function getRulesByCategory(category: Category): CategoryRule[] {
  return CATEGORY_RULES_V2.filter((r) => r.category === category);
}
