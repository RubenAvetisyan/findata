export interface CategoryRule {
  pattern: RegExp;
  category: string;
  subcategory: string | null;
  confidence: number;
}

export const CATEGORY_RULES: CategoryRule[] = [
  // Income
  { pattern: /\b(payroll|direct dep|salary|wages)\b/i, category: 'Income', subcategory: 'Salary', confidence: 0.95 },
  { pattern: /\b(interest paid|interest payment)\b/i, category: 'Income', subcategory: 'Interest', confidence: 0.9 },
  { pattern: /\b(dividend|divd)\b/i, category: 'Income', subcategory: 'Dividends', confidence: 0.9 },
  { pattern: /\b(refund|rebate)\b/i, category: 'Income', subcategory: 'Refund', confidence: 0.85 },
  { pattern: /\b(venmo|zelle|paypal).*(from|received)/i, category: 'Income', subcategory: 'Transfer', confidence: 0.8 },

  // Housing
  { pattern: /\b(rent|lease payment)\b/i, category: 'Housing', subcategory: 'Rent', confidence: 0.9 },
  { pattern: /\b(mortgage|home loan)\b/i, category: 'Housing', subcategory: 'Mortgage', confidence: 0.95 },
  { pattern: /\b(hoa|homeowner.*assoc)\b/i, category: 'Housing', subcategory: 'HOA', confidence: 0.9 },
  { pattern: /\b(property tax)\b/i, category: 'Housing', subcategory: 'Property Tax', confidence: 0.9 },

  // Utilities
  { pattern: /\b(electric|power|energy|edison|pge|pg&e)\b/i, category: 'Utilities', subcategory: 'Electric', confidence: 0.85 },
  { pattern: /\b(gas company|natural gas|socal gas)\b/i, category: 'Utilities', subcategory: 'Gas', confidence: 0.85 },
  { pattern: /\b(water|sewer|dwp)\b/i, category: 'Utilities', subcategory: 'Water', confidence: 0.8 },
  { pattern: /\b(internet|comcast|xfinity|spectrum|att|verizon fios)\b/i, category: 'Utilities', subcategory: 'Internet', confidence: 0.85 },
  { pattern: /\b(phone|t-mobile|at&t|verizon wireless|sprint)\b/i, category: 'Utilities', subcategory: 'Phone', confidence: 0.8 },

  // Transportation
  { pattern: /\b(uber|lyft|taxi|cab)\b/i, category: 'Transportation', subcategory: 'Rideshare', confidence: 0.95 },
  { pattern: /\b(metro|tap|transit|mta|bart|caltrain|amtrak|metrolink)\b/i, category: 'Transportation', subcategory: 'Public Transit', confidence: 0.9 },
  { pattern: /\b(chevron|shell|exxon|mobil|arco|76|gas station|fuel|7-eleven.*ga)\b/i, category: 'Transportation', subcategory: 'Gas', confidence: 0.9 },
  { pattern: /\b(parking|park meter|paybyphone)\b/i, category: 'Transportation', subcategory: 'Parking', confidence: 0.85 },
  { pattern: /\b(toll|fastrak|ezpass)\b/i, category: 'Transportation', subcategory: 'Tolls', confidence: 0.9 },
  { pattern: /\b(auto insurance|car insurance|geico|progressive|allstate|state farm)\b/i, category: 'Transportation', subcategory: 'Insurance', confidence: 0.9 },
  { pattern: /\b(dmv|registration|vehicle reg)\b/i, category: 'Transportation', subcategory: 'Registration', confidence: 0.85 },

  // Food & Dining
  { pattern: /\b(grocery|safeway|trader joe|whole foods|kroger|ralphs|vons|albertsons|costco|walmart supercenter|target|foodmart|food mart)\b/i, category: 'Food & Dining', subcategory: 'Groceries', confidence: 0.85 },
  { pattern: /\b(restaurant|cafe|coffee|starbucks|dunkin|mcdonald|burger|pizza|chipotle|subway|taco bell|wendy|chick-fil-a|panda express|pizzeria|deli|lounge|haagen-dazs|ice cream|moo moo mia)\b/i, category: 'Food & Dining', subcategory: 'Restaurants', confidence: 0.9 },
  { pattern: /\b(doordash|grubhub|uber eats|postmates|seamless)\b/i, category: 'Food & Dining', subcategory: 'Food Delivery', confidence: 0.95 },
  { pattern: /\b(bar|pub|brewery|wine|liquor)\b/i, category: 'Food & Dining', subcategory: 'Alcohol', confidence: 0.8 },

  // Shopping
  { pattern: /\b(amazon|amzn)\b/i, category: 'Shopping', subcategory: 'Online', confidence: 0.85 },
  { pattern: /\b(temu|temu\.com|shein|aliexpress)\b/i, category: 'Shopping', subcategory: 'Online', confidence: 0.85 },
  { pattern: /\b(tiktok shop|tiktok)\b/i, category: 'Shopping', subcategory: 'Online', confidence: 0.85 },
  { pattern: /\b(target|walmart|costco|sam's club)\b/i, category: 'Shopping', subcategory: 'General Merchandise', confidence: 0.8 },
  { pattern: /\b(best buy|apple store|electronics)\b/i, category: 'Shopping', subcategory: 'Electronics', confidence: 0.85 },
  { pattern: /\b(home depot|lowes|ace hardware)\b/i, category: 'Shopping', subcategory: 'Home Improvement', confidence: 0.9 },
  { pattern: /\b(nordstrom|macy|bloomingdale|clothing|apparel)\b/i, category: 'Shopping', subcategory: 'Clothing', confidence: 0.8 },
  { pattern: /\b(7-eleven|7 eleven|circle k|am\/?pm|convenience)\b/i, category: 'Shopping', subcategory: 'Convenience Store', confidence: 0.8 },
  { pattern: /-eleven\b/i, category: 'Shopping', subcategory: 'Convenience Store', confidence: 0.8 },

  // Entertainment
  { pattern: /\b(netflix|hulu|disney\+|hbo|spotify|apple music|youtube premium|paramount)\b/i, category: 'Entertainment', subcategory: 'Streaming', confidence: 0.95 },
  { pattern: /\b(movie|cinema|amc|regal|theater)\b/i, category: 'Entertainment', subcategory: 'Movies', confidence: 0.85 },
  { pattern: /\b(concert|ticketmaster|stubhub|eventbrite|live nation)\b/i, category: 'Entertainment', subcategory: 'Events', confidence: 0.85 },
  { pattern: /\b(gym|fitness|planet fitness|24 hour|equinox|la fitness)\b/i, category: 'Entertainment', subcategory: 'Fitness', confidence: 0.9 },
  { pattern: /\b(playstation|xbox|steam|nintendo|gaming)\b/i, category: 'Entertainment', subcategory: 'Gaming', confidence: 0.85 },

  // Software & Subscriptions
  { pattern: /\b(openai|chatgpt|gpt)\b/i, category: 'Software', subcategory: 'AI Services', confidence: 0.95 },
  { pattern: /\b(windsurf|stackblitz|bolt\.new|bolt by stackblitz|github|gitlab|vercel|netlify|heroku)\b/i, category: 'Software', subcategory: 'Developer Tools', confidence: 0.9 },
  { pattern: /\b(adobe|microsoft|office 365|google workspace|dropbox|icloud)\b/i, category: 'Software', subcategory: 'Productivity', confidence: 0.9 },
  { pattern: /\bgoogle\s*\*/i, category: 'Software', subcategory: 'Subscription', confidence: 0.85 },
  { pattern: /\b(vpn|nordvpn|expressvpn|surfshark)\b/i, category: 'Software', subcategory: 'Security', confidence: 0.85 },

  // Health
  { pattern: /\b(pharmacy|cvs|walgreens|rite aid|prescription)\b/i, category: 'Health', subcategory: 'Pharmacy', confidence: 0.85 },
  { pattern: /\b(doctor|physician|medical|clinic|hospital|urgent care)\b/i, category: 'Health', subcategory: 'Medical', confidence: 0.8 },
  { pattern: /\b(dentist|dental|orthodont)\b/i, category: 'Health', subcategory: 'Dental', confidence: 0.9 },
  { pattern: /\b(vision|optometrist|eye doctor|glasses|contacts)\b/i, category: 'Health', subcategory: 'Vision', confidence: 0.85 },
  { pattern: /\b(health insurance|medical insurance|anthem|kaiser|blue cross|aetna|cigna|united health)\b/i, category: 'Health', subcategory: 'Insurance', confidence: 0.9 },

  // Financial
  { pattern: /\b(atm|cash withdrawal|withdraw|withdrwl)\b/i, category: 'Financial', subcategory: 'ATM', confidence: 0.95 },
  { pattern: /\b(deposit|cash deposit)\b/i, category: 'Financial', subcategory: 'Deposit', confidence: 0.9 },
  { pattern: /\bcheck\s*#?\d+\b/i, category: 'Financial', subcategory: 'Check', confidence: 0.95 },
  { pattern: /\b(transfer|xfer|zelle)\b/i, category: 'Financial', subcategory: 'Transfer', confidence: 0.7 },
  { pattern: /\b(klover|dave|earnin|brigit|cash advance)\b/i, category: 'Financial', subcategory: 'Cash Advance', confidence: 0.9 },
  { pattern: /\b(chime|pmnt sent)\b/i, category: 'Financial', subcategory: 'Payment', confidence: 0.85 },
  { pattern: /\b(fee|service charge|monthly maintenance|overdraft)\b/i, category: 'Financial', subcategory: 'Fees', confidence: 0.9 },
  { pattern: /\b(credit card payment|card payment)\b/i, category: 'Financial', subcategory: 'Credit Card Payment', confidence: 0.9 },
  { pattern: /\b(loan payment|student loan|auto loan)\b/i, category: 'Financial', subcategory: 'Loan Payment', confidence: 0.9 },
  { pattern: /\b(investment|brokerage|fidelity|schwab|vanguard|robinhood|etrade)\b/i, category: 'Financial', subcategory: 'Investment', confidence: 0.85 },
  { pattern: /\bgwp\b|glendale.*water/i, category: 'Utilities', subcategory: 'Water', confidence: 0.85 },

  // Travel
  { pattern: /\b(airline|flight|delta|united|american airlines|southwest|jetblue|alaska air)\b/i, category: 'Travel', subcategory: 'Flights', confidence: 0.9 },
  { pattern: /\b(hotel|marriott|hilton|hyatt|airbnb|vrbo|motel)\b/i, category: 'Travel', subcategory: 'Lodging', confidence: 0.9 },
  { pattern: /\b(car rental|hertz|enterprise|avis|budget|national)\b/i, category: 'Travel', subcategory: 'Car Rental', confidence: 0.9 },

  // Education & Professional
  { pattern: /\b(tuition|university|college|school)\b/i, category: 'Education', subcategory: 'Tuition', confidence: 0.85 },
  { pattern: /\b(book|textbook|course|udemy|coursera|skillshare)\b/i, category: 'Education', subcategory: 'Learning', confidence: 0.7 },
  { pattern: /\b(psi exams|exam|certification|test center)\b/i, category: 'Education', subcategory: 'Certification', confidence: 0.85 },

  // Personal Care
  { pattern: /\b(salon|haircut|barber|spa|massage|nail)\b/i, category: 'Personal Care', subcategory: 'Grooming', confidence: 0.85 },
  { pattern: /\b(sephora|ulta|beauty|cosmetic)\b/i, category: 'Personal Care', subcategory: 'Beauty', confidence: 0.85 },

  // Insurance
  { pattern: /\b(life insurance|term life|whole life)\b/i, category: 'Insurance', subcategory: 'Life', confidence: 0.9 },
  { pattern: /\b(renter.*insurance|renters)\b/i, category: 'Insurance', subcategory: 'Renters', confidence: 0.85 },

  // Taxes
  { pattern: /\b(irs|tax payment|federal tax|state tax)\b/i, category: 'Taxes', subcategory: 'Tax Payment', confidence: 0.9 },
  { pattern: /\b(turbotax|h&r block|tax prep)\b/i, category: 'Taxes', subcategory: 'Tax Preparation', confidence: 0.85 },

  // Charity
  { pattern: /\b(donation|charity|nonprofit|foundation|red cross|united way)\b/i, category: 'Charity', subcategory: 'Donation', confidence: 0.85 },

  // Pets
  { pattern: /\b(pet|petco|petsmart|veterinar|vet clinic)\b/i, category: 'Pets', subcategory: 'Pet Care', confidence: 0.85 },

  // Childcare
  { pattern: /\b(daycare|childcare|babysit|nanny)\b/i, category: 'Childcare', subcategory: 'Daycare', confidence: 0.85 },
];

export const DEFAULT_CATEGORY = 'Uncategorized';
export const DEFAULT_CONFIDENCE = 0.5;
