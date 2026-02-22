export function parseAmount(amountStr: string): number {
  const cleaned = amountStr.replace(/[$,\s]/g, '').replace(/[()]/g, '-');

  const isNegative = cleaned.startsWith('-') || amountStr.includes('(');

  const numStr = cleaned.replace(/^-/, '');
  const num = parseFloat(numStr);

  if (isNaN(num)) {
    throw new Error(`Unable to parse amount: ${amountStr}`);
  }

  return isNegative ? -Math.abs(num) : Math.abs(num);
}

export function roundToTwoDecimals(num: number): number {
  return Math.round(num * 100) / 100;
}

export function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return amount < 0 ? `-${formatted}` : formatted;
}

export function sumAmounts(amounts: number[]): number {
  return roundToTwoDecimals(amounts.reduce((sum, amt) => sum + amt, 0));
}
