export type ISODate = `${number}-${number}-${number}`;
export type ISODateTime = string; // ISO-8601

export type AccountType = "checking" | "credit";
export type Direction = "debit" | "credit";

export type Category =
  | "Income"
  | "Housing"
  | "Utilities"
  | "Transportation"
  | "Food & Dining"
  | "Shopping"
  | "Entertainment"
  | "Health"
  | "Financial"
  | "Travel"
  | "Education"
  | "Personal Care"
  | "Insurance"
  | "Taxes"
  | "Charity"
  | "Pets"
  | "Childcare"
  | "Uncategorized";

export type Subcategory =
  | "Salary" | "Interest" | "Dividends" | "Refund" | "Transfer"
  | "Rent" | "Mortgage" | "HOA" | "Property Tax"
  | "Electric" | "Gas" | "Water" | "Internet" | "Phone"
  | "Rideshare" | "Gas" | "Parking" | "Tolls" | "Insurance"
  | "Groceries" | "Restaurants" | "Food Delivery" | "Alcohol"
  | "Online" | "General Merchandise" | "Electronics" | "Clothing"
  | "Streaming" | "Movies" | "Events" | "Fitness" | "Gaming"
  | "Pharmacy" | "Medical" | "Dental" | "Vision" | "Insurance"
  | "ATM" | "Transfer" | "Fees" | "Credit Card Payment" | "Investment"
  | "Flights" | "Lodging" | "Car Rental"
  | "Tuition" | "Learning"
  | "Grooming" | "Beauty"
  | "Life" | "Renters"
  | "Tax Payment" | "Tax Preparation"
  | "Donation"
  | "Pet Care"
  | "Daycare"
  | null;

export interface StatementFileOutput {
  schemaVersion: "1.0.0";
  source: {
    fileName: string;
    fileType: "pdf";
    checksumSha256?: string;
    pageCount?: number;
  };
  statements: Statement[];
  metadata: {
    parser: {
      name: string;
      version: string;
      build?: string;
    };
    parsedAt: ISODateTime;
    warnings: string[];
    notes?: string[];
  };
}

export interface Statement {
  statementId: string; // stable hash of (institution + acctMask + start + end)
  account: {
    institution: "Bank of America";
    productName?: string; // e.g., "Adv Plus Banking" as printed
    accountType: AccountType;
    accountNumberMasked: string; // "****3529"
    currency: "USD";
    statementPeriod: {
      start: ISODate;
      end: ISODate;
    };
    statementCycle?: string; // e.g. "CYCLE: 5" if you extract it
  };

  summary: {
    beginningBalance: number;
    endingBalance: number;

    // Statement-level rollups as printed (optional but useful)
    depositsAndOtherAdditions?: number;
    atmAndDebitCardSubtractions?: number;
    otherSubtractions?: number;
    checksTotal?: number;
    serviceFeesTotal?: number;

    // Computed rollups (from transactions array)
    totalCredits: number;
    totalDebits: number;
    transactionCount: number;
  };

  sections?: {
    // Optional, but mirrors statement structure:
    deposits?: StatementSectionTotals;
    atmAndDebitCard?: StatementSectionTotals;
    otherSubtractions?: StatementSectionTotals;
    checks?: StatementSectionTotals;
    serviceFees?: StatementSectionTotals;
  };

  transactions: Transaction[];

  provenance: {
    // Where in the PDF this statement was found
    pageStart?: number; // 1-based
    pageEnd?: number;   // 1-based
    extractedFromText?: boolean;
  };
}

export interface StatementSectionTotals {
  total?: number;
  count?: number;
  // raw text line you used to parse the total (debug)
  rawTotalLine?: string;
}

export interface Transaction {
  transactionId: string; // stable hash of (statementId + date + amount + normalizedDescription)
  date: ISODate;         // transaction date
  postedDate: ISODate | null; // often absent in statement tables; keep for future sources
  amount: number;        // negative for debits, positive for credits
  direction: Direction;  // derived from sign or table section
  description: string;   // cleaned description line
  descriptionRaw: string; // original line exactly as parsed

  merchant: {
    name: string | null;     // e.g., "GLENROSE LIQUOR", "NICO'S PIZZA"
    normalizedName?: string | null;
    city?: string | null;
    state?: string | null;
    phone?: string | null;   // when present (e.g., "800-777-0133")
    online?: boolean | null; // inferred from patterns (e.g., "WINDSURF.COM", "Amzn.com/bill")
    network?: "VISA" | "MASTERCARD" | "AMEX" | "DISCOVER" | null; // if ever inferred
  };

  bankReference: {
    // These are the “long numbers” you asked about; store them but do NOT use for categorization.
    cardTransactionTraceNumber?: string | null; // e.g. 24801975260482319110911
    confirmationNumber?: string | null;         // e.g. Online Banking “Confirmation# …”
    zelleConfirmation?: string | null;          // e.g. “Conf# T0ZDL3WND”
    checkNumber?: string | null;                // from Checks section
    atmId?: string | null;                      // e.g. “#000009733”
    terminalOrStoreId?: string | null;          // if you ever parse one
  };

  channel: {
    // “what kind of line is this”
    type:
      | "CHECKCARD"
      | "PURCHASE"
      | "ATM_DEPOSIT"
      | "ATM_WITHDRAWAL"
      | "FINANCIAL_CENTER_DEPOSIT"
      | "ONLINE_BANKING_TRANSFER"
      | "ZELLE"
      | "CHECK"
      | "FEE"
      | "OTHER";
    subtype?: string | null; // e.g. "transfer_from_sav", "transfer_to_sav", etc.
  };

  categorization: {
    category: Category;
    subcategory: Subcategory;
    confidence: number; // 0..1 (use 0.5 for Uncategorized as you said)
    ruleId?: string | null; // which rule matched, if any
    rationale?: string | null; // short debug explanation
  };

  raw: {
    page: number; // 1-based page number in PDF
    lineIndex?: number; // index within extracted table lines
    section?: "deposits" | "atm_debit" | "other_subtractions" | "checks" | "service_fees" | null;
    originalText: string;
  };

  flags?: {
    isRecurring?: boolean;
    isSubscription?: boolean;
    isTransfer?: boolean;
    isCashWithdrawal?: boolean;
    isCashDeposit?: boolean;
    possibleDuplicate?: boolean;
  };
}
