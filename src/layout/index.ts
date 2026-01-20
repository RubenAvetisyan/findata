/**
 * Layout utilities for PDF parsing.
 * Provides row clustering and column detection for table extraction.
 */

export {
  groupByRows,
  sortRowByX,
  mergeWrappedDescriptions,
  filterRowsByYRange,
  getRowsForPage,
} from './rows.js';

export type { Row } from './rows.js';

export {
  detectColumnsFromHeader,
  inferColumnsByXClusters,
  getColumnForItem,
  mapRowToColumns,
  detectBoaTransactionColumns,
  extractBoaTransactionFromRow,
} from './columns.js';

export type { Column, ColumnMapping } from './columns.js';
