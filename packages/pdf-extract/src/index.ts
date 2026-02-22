// PDF extraction
export {
  extractPDF,
  findLinesByPattern,
  extractTextBetweenMarkers,
} from './pdf-extractor.js';

export type { ExtractedPage, ExtractedPDF } from './pdf-extractor.js';

// Layout-aware extraction using pdfjs-dist
export {
  extractTextItems,
  extractTextItemsFromBuffer,
  buildLinesFromItems,
  buildLinesForPage,
} from './layout-pdfjs.js';

export type { TextItem, LayoutExtractedPDF } from './layout-pdfjs.js';

// Layout utilities (rows + columns)
export * from './layout/index.js';
