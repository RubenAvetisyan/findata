export function parseUSDate(dateStr: string, statementYear?: number): string {
  const trimmed = dateStr.trim();

  const mmddyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mmddyyMatch) {
    const [, month, day, year] = mmddyyMatch;
    if (month === undefined || day === undefined || year === undefined) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const mmddMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmddMatch) {
    const [, month, day] = mmddMatch;
    if (month === undefined || day === undefined) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    const year = statementYear ?? new Date().getFullYear();
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const monthDayMatch = trimmed.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (monthDayMatch) {
    const [, monthName, day] = monthDayMatch;
    if (monthName === undefined || day === undefined) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    const monthNum = monthNameToNumber(monthName);
    const year = statementYear ?? new Date().getFullYear();
    return `${year}-${monthNum.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  throw new Error(`Unable to parse date: ${dateStr}`);
}

function monthNameToNumber(monthName: string): number {
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const num = months[monthName.toLowerCase()];
  if (num === undefined) {
    throw new Error(`Unknown month name: ${monthName}`);
  }
  return num;
}

export function inferStatementYear(startDate: string, endDate: string): number {
  const endYear = parseInt(endDate.split('-')[0] ?? '0', 10);
  return endYear;
}

export function isValidISODate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

export function compareDates(a: string, b: string): number {
  return a.localeCompare(b);
}
