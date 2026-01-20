/**
 * Analytics module for generating financial summaries and reports.
 * Provides quarterly cash flow, income vs expenses, lender summaries, and tax categorization.
 */

import type { ParsedStatement, Transaction } from '../schemas/index.js';

/**
 * Quarterly cash flow data
 */
export interface QuarterlyCashFlow {
  quarter: string; // e.g., "2025-Q1"
  year: number;
  quarterNumber: 1 | 2 | 3 | 4;
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  transactionCount: number;
}

/**
 * Income vs Expenses summary (excluding internal transfers)
 */
export interface IncomeVsExpenses {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  incomeByCategory: Record<string, number>;
  expensesByCategory: Record<string, number>;
  excludedTransfers: number;
  periodStart: string;
  periodEnd: string;
}

/**
 * Lender-ready income stability summary
 */
export interface LenderSummary {
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  monthlyIncomeVariance: number;
  incomeStabilityScore: number; // 0-100
  consecutiveMonthsWithIncome: number;
  totalMonthsAnalyzed: number;
  monthlyBreakdown: Array<{
    month: string; // YYYY-MM
    income: number;
    expenses: number;
    netCashFlow: number;
  }>;
  incomeSourceDiversity: number; // Count of distinct income sources
  regularIncomeDetected: boolean;
  estimatedAnnualIncome: number;
}

/**
 * Tax category summary
 */
export interface TaxCategorySummary {
  category: string;
  subcategory: string | null;
  totalAmount: number;
  transactionCount: number;
  taxRelevance: 'deductible' | 'income' | 'neutral' | 'review';
}

/**
 * Full tax preparation summary
 */
export interface TaxPreparation {
  taxYear: number;
  totalTaxableIncome: number;
  totalDeductibleExpenses: number;
  potentialDeductions: TaxCategorySummary[];
  incomeCategories: TaxCategorySummary[];
  reviewRequired: TaxCategorySummary[];
  summary: {
    businessExpenses: number;
    medicalExpenses: number;
    charitableContributions: number;
    homeOffice: number;
    professionalServices: number;
    otherDeductible: number;
  };
}

/**
 * Complete analytics result
 */
export interface AnalyticsResult {
  quarterlyCashFlow: QuarterlyCashFlow[];
  incomeVsExpenses: IncomeVsExpenses;
  lenderSummary: LenderSummary;
  taxPreparation: TaxPreparation;
}

// Categories that indicate internal transfers (excluded from income/expense calculations)
const TRANSFER_CATEGORIES = ['Transfer'];
const TRANSFER_SUBCATEGORIES = ['Transfer', 'Internal Transfer', 'Internal', 'Zelle', 'Venmo', 'Wire', 'ACH'];

// Categories that indicate income
const INCOME_CATEGORIES = ['Income'];
const INCOME_SUBCATEGORIES = ['Salary', 'Deposit', 'Direct Deposit', 'Payroll', 'Interest', 'Refund', 'Reimbursement'];

// Tax-relevant category mappings
const TAX_DEDUCTIBLE_CATEGORIES: Record<string, string[]> = {
  'Business': ['Office Supplies', 'Software', 'Equipment', 'Professional Services'],
  'Health': ['Medical', 'Pharmacy', 'Healthcare', 'Insurance'],
  'Education': ['Tuition', 'Books', 'Courses'],
  'Professional Services': ['Legal', 'Accounting', 'Consulting'],
  'Charitable': ['Donation', 'Charity'],
};

const TAX_INCOME_CATEGORIES = ['Income', 'Financial'];
const TAX_INCOME_SUBCATEGORIES = ['Salary', 'Interest', 'Dividend', 'Rental Income', 'Business Income'];

/**
 * Check if a transaction is an internal transfer
 */
function isInternalTransfer(txn: Transaction): boolean {
  const desc = txn.description.toLowerCase();
  
  // Check for transfer keywords in description
  if (desc.includes('transfer from') || desc.includes('transfer to') ||
      desc.includes('xfer from') || desc.includes('xfer to') ||
      desc.includes('online banking transfer')) {
    return true;
  }
  
  // Check category (Transfer category is always a transfer)
  if (TRANSFER_CATEGORIES.includes(txn.category)) {
    return true;
  }
  
  // Check subcategory
  if (TRANSFER_SUBCATEGORIES.includes(txn.subcategory ?? '')) {
    return true;
  }
  
  return false;
}

/**
 * Check if a transaction is income
 */
function isIncome(txn: Transaction): boolean {
  if (txn.direction !== 'credit') return false;
  if (isInternalTransfer(txn)) return false;
  
  // Check category
  if (INCOME_CATEGORIES.includes(txn.category)) return true;
  if (INCOME_SUBCATEGORIES.includes(txn.subcategory ?? '')) return true;
  
  // Credits that aren't transfers are generally income
  return true;
}

/**
 * Check if a transaction is an expense
 */
function isExpense(txn: Transaction): boolean {
  if (txn.direction !== 'debit') return false;
  if (isInternalTransfer(txn)) return false;
  return true;
}

/**
 * Get quarter string from date
 */
function getQuarter(dateStr: string): { quarter: string; year: number; quarterNumber: 1 | 2 | 3 | 4 } {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth();
  const quarterNumber = (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4;
  return {
    quarter: `${year}-Q${quarterNumber}`,
    year,
    quarterNumber,
  };
}

/**
 * Get month string from date
 */
function getMonth(dateStr: string): string {
  return dateStr.substring(0, 7); // YYYY-MM
}

/**
 * Get quarter date range
 */
function getQuarterDateRange(year: number, quarterNumber: number): { start: string; end: string } {
  const startMonth = (quarterNumber - 1) * 3;
  const endMonth = startMonth + 2;
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, endMonth + 1, 0); // Last day of end month
  
  return {
    start: startDate.toISOString().split('T')[0] ?? '',
    end: endDate.toISOString().split('T')[0] ?? '',
  };
}

/**
 * Calculate quarterly cash flow from transactions
 */
export function calculateQuarterlyCashFlow(transactions: Transaction[]): QuarterlyCashFlow[] {
  const quarterMap = new Map<string, {
    year: number;
    quarterNumber: 1 | 2 | 3 | 4;
    income: number;
    expenses: number;
    count: number;
  }>();
  
  for (const txn of transactions) {
    if (isInternalTransfer(txn)) continue;
    
    const { quarter, year, quarterNumber } = getQuarter(txn.date);
    const existing = quarterMap.get(quarter) ?? {
      year,
      quarterNumber,
      income: 0,
      expenses: 0,
      count: 0,
    };
    
    if (isIncome(txn)) {
      existing.income += Math.abs(txn.amount);
    } else if (isExpense(txn)) {
      existing.expenses += Math.abs(txn.amount);
    }
    existing.count++;
    
    quarterMap.set(quarter, existing);
  }
  
  return Array.from(quarterMap.entries())
    .map(([quarter, data]) => {
      const dateRange = getQuarterDateRange(data.year, data.quarterNumber);
      return {
        quarter,
        year: data.year,
        quarterNumber: data.quarterNumber,
        startDate: dateRange.start,
        endDate: dateRange.end,
        totalIncome: Math.round(data.income * 100) / 100,
        totalExpenses: Math.round(data.expenses * 100) / 100,
        netCashFlow: Math.round((data.income - data.expenses) * 100) / 100,
        transactionCount: data.count,
      };
    })
    .sort((a, b) => a.quarter.localeCompare(b.quarter));
}

/**
 * Calculate income vs expenses summary
 */
export function calculateIncomeVsExpenses(
  transactions: Transaction[],
  periodStart: string,
  periodEnd: string
): IncomeVsExpenses {
  let totalIncome = 0;
  let totalExpenses = 0;
  let excludedTransfers = 0;
  const incomeByCategory: Record<string, number> = {};
  const expensesByCategory: Record<string, number> = {};
  
  for (const txn of transactions) {
    if (isInternalTransfer(txn)) {
      excludedTransfers += Math.abs(txn.amount);
      continue;
    }
    
    if (isIncome(txn)) {
      const amount = Math.abs(txn.amount);
      totalIncome += amount;
      incomeByCategory[txn.category] = (incomeByCategory[txn.category] ?? 0) + amount;
    } else if (isExpense(txn)) {
      const amount = Math.abs(txn.amount);
      totalExpenses += amount;
      expensesByCategory[txn.category] = (expensesByCategory[txn.category] ?? 0) + amount;
    }
  }
  
  // Round category totals
  for (const key of Object.keys(incomeByCategory)) {
    incomeByCategory[key] = Math.round((incomeByCategory[key] ?? 0) * 100) / 100;
  }
  for (const key of Object.keys(expensesByCategory)) {
    expensesByCategory[key] = Math.round((expensesByCategory[key] ?? 0) * 100) / 100;
  }
  
  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netIncome: Math.round((totalIncome - totalExpenses) * 100) / 100,
    incomeByCategory,
    expensesByCategory,
    excludedTransfers: Math.round(excludedTransfers * 100) / 100,
    periodStart,
    periodEnd,
  };
}

/**
 * Calculate lender-ready income stability summary
 */
export function calculateLenderSummary(transactions: Transaction[]): LenderSummary {
  // Group by month
  const monthlyData = new Map<string, { income: number; expenses: number; sources: Set<string> }>();
  
  for (const txn of transactions) {
    if (isInternalTransfer(txn)) continue;
    
    const month = getMonth(txn.date);
    const existing = monthlyData.get(month) ?? { income: 0, expenses: 0, sources: new Set() };
    
    if (isIncome(txn)) {
      existing.income += Math.abs(txn.amount);
      existing.sources.add(txn.category);
    } else if (isExpense(txn)) {
      existing.expenses += Math.abs(txn.amount);
    }
    
    monthlyData.set(month, existing);
  }
  
  const months = Array.from(monthlyData.keys()).sort();
  const monthlyBreakdown = months.map(month => {
    const data = monthlyData.get(month)!;
    return {
      month,
      income: Math.round(data.income * 100) / 100,
      expenses: Math.round(data.expenses * 100) / 100,
      netCashFlow: Math.round((data.income - data.expenses) * 100) / 100,
    };
  });
  
  // Calculate statistics
  const incomes = monthlyBreakdown.map(m => m.income);
  const expenses = monthlyBreakdown.map(m => m.expenses);
  
  const avgIncome = incomes.length > 0 ? incomes.reduce((a, b) => a + b, 0) / incomes.length : 0;
  const avgExpenses = expenses.length > 0 ? expenses.reduce((a, b) => a + b, 0) / expenses.length : 0;
  
  // Calculate variance (coefficient of variation)
  const incomeVariance = incomes.length > 1
    ? Math.sqrt(incomes.reduce((sum, val) => sum + Math.pow(val - avgIncome, 2), 0) / incomes.length) / (avgIncome || 1)
    : 0;
  
  // Count consecutive months with income
  let consecutiveMonths = 0;
  let currentStreak = 0;
  for (const m of monthlyBreakdown) {
    if (m.income > 0) {
      currentStreak++;
      consecutiveMonths = Math.max(consecutiveMonths, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  // Calculate income stability score (0-100)
  // Based on: variance (lower is better), consecutive months, and regularity
  const varianceScore = Math.max(0, 100 - incomeVariance * 100);
  const consecutiveScore = Math.min(100, (consecutiveMonths / Math.max(months.length, 1)) * 100);
  const regularityScore = incomes.filter(i => i > avgIncome * 0.5).length / Math.max(incomes.length, 1) * 100;
  const stabilityScore = Math.round((varianceScore * 0.4 + consecutiveScore * 0.3 + regularityScore * 0.3));
  
  // Count unique income sources
  const allSources = new Set<string>();
  for (const data of monthlyData.values()) {
    for (const source of data.sources) {
      allSources.add(source);
    }
  }
  
  // Detect regular income (same amount appearing multiple times)
  const incomeAmounts = transactions
    .filter(t => isIncome(t))
    .map(t => Math.round(Math.abs(t.amount)));
  const amountCounts = new Map<number, number>();
  for (const amt of incomeAmounts) {
    amountCounts.set(amt, (amountCounts.get(amt) ?? 0) + 1);
  }
  const regularIncomeDetected = Array.from(amountCounts.values()).some(count => count >= 3);
  
  return {
    averageMonthlyIncome: Math.round(avgIncome * 100) / 100,
    averageMonthlyExpenses: Math.round(avgExpenses * 100) / 100,
    monthlyIncomeVariance: Math.round(incomeVariance * 10000) / 10000,
    incomeStabilityScore: stabilityScore,
    consecutiveMonthsWithIncome: consecutiveMonths,
    totalMonthsAnalyzed: months.length,
    monthlyBreakdown,
    incomeSourceDiversity: allSources.size,
    regularIncomeDetected,
    estimatedAnnualIncome: Math.round(avgIncome * 12 * 100) / 100,
  };
}

/**
 * Determine tax relevance of a category
 */
function getTaxRelevance(category: string, subcategory: string | null): 'deductible' | 'income' | 'neutral' | 'review' {
  // Check if income
  if (TAX_INCOME_CATEGORIES.includes(category)) {
    if (subcategory !== null && subcategory !== '' && TAX_INCOME_SUBCATEGORIES.includes(subcategory)) {
      return 'income';
    }
  }
  
  // Check if deductible
  const deductibleSubs = TAX_DEDUCTIBLE_CATEGORIES[category];
  if (deductibleSubs !== undefined) {
    if (subcategory === null || subcategory === '' || deductibleSubs.includes(subcategory)) {
      return 'deductible';
    }
  }
  
  // Categories that need review
  if (['Business', 'Professional Services', 'Education'].includes(category)) {
    return 'review';
  }
  
  return 'neutral';
}

/**
 * Calculate tax preparation summary
 */
export function calculateTaxPreparation(transactions: Transaction[]): TaxPreparation {
  // Determine tax year from transactions
  const years = transactions.map(t => new Date(t.date).getFullYear());
  const taxYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear();
  
  // Filter to tax year
  const taxYearTxns = transactions.filter(t => new Date(t.date).getFullYear() === taxYear);
  
  // Group by category + subcategory
  const categoryMap = new Map<string, {
    category: string;
    subcategory: string | null;
    total: number;
    count: number;
    relevance: 'deductible' | 'income' | 'neutral' | 'review';
  }>();
  
  let totalTaxableIncome = 0;
  let totalDeductibleExpenses = 0;
  
  const summary = {
    businessExpenses: 0,
    medicalExpenses: 0,
    charitableContributions: 0,
    homeOffice: 0,
    professionalServices: 0,
    otherDeductible: 0,
  };
  
  for (const txn of taxYearTxns) {
    if (isInternalTransfer(txn)) continue;
    
    const key = `${txn.category}|${txn.subcategory ?? ''}`;
    const relevance = getTaxRelevance(txn.category, txn.subcategory);
    const amount = Math.abs(txn.amount);
    
    const existing = categoryMap.get(key) ?? {
      category: txn.category,
      subcategory: txn.subcategory,
      total: 0,
      count: 0,
      relevance,
    };
    
    existing.total += amount;
    existing.count++;
    categoryMap.set(key, existing);
    
    // Track totals
    if (relevance === 'income' && isIncome(txn)) {
      totalTaxableIncome += amount;
    } else if (relevance === 'deductible' && isExpense(txn)) {
      totalDeductibleExpenses += amount;
      
      // Categorize deductions
      if (txn.category === 'Business') {
        summary.businessExpenses += amount;
      } else if (txn.category === 'Health') {
        summary.medicalExpenses += amount;
      } else if (txn.category === 'Charitable') {
        summary.charitableContributions += amount;
      } else if (txn.subcategory === 'Home Office') {
        summary.homeOffice += amount;
      } else if (txn.category === 'Professional Services') {
        summary.professionalServices += amount;
      } else {
        summary.otherDeductible += amount;
      }
    }
  }
  
  // Convert to arrays
  const allCategories: TaxCategorySummary[] = Array.from(categoryMap.values()).map(c => ({
    category: c.category,
    subcategory: c.subcategory,
    totalAmount: Math.round(c.total * 100) / 100,
    transactionCount: c.count,
    taxRelevance: c.relevance,
  }));
  
  // Round summary values
  for (const key of Object.keys(summary) as (keyof typeof summary)[]) {
    summary[key] = Math.round(summary[key] * 100) / 100;
  }
  
  return {
    taxYear,
    totalTaxableIncome: Math.round(totalTaxableIncome * 100) / 100,
    totalDeductibleExpenses: Math.round(totalDeductibleExpenses * 100) / 100,
    potentialDeductions: allCategories.filter(c => c.taxRelevance === 'deductible'),
    incomeCategories: allCategories.filter(c => c.taxRelevance === 'income'),
    reviewRequired: allCategories.filter(c => c.taxRelevance === 'review'),
    summary,
  };
}

/**
 * Generate complete analytics from statements
 */
export function generateAnalytics(statements: ParsedStatement[]): AnalyticsResult {
  // Collect all transactions
  const allTransactions = statements.flatMap(s => s.transactions);
  
  // Sort by date
  allTransactions.sort((a, b) => a.date.localeCompare(b.date));
  
  // Determine period
  const periodStart = allTransactions[0]?.date ?? '';
  const periodEnd = allTransactions[allTransactions.length - 1]?.date ?? '';
  
  return {
    quarterlyCashFlow: calculateQuarterlyCashFlow(allTransactions),
    incomeVsExpenses: calculateIncomeVsExpenses(allTransactions, periodStart, periodEnd),
    lenderSummary: calculateLenderSummary(allTransactions),
    taxPreparation: calculateTaxPreparation(allTransactions),
  };
}
