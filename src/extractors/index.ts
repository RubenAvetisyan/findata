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
} from './layout-pdfjs.js';

export type { TextItem, LayoutExtractedPDF } from './layout-pdfjs.js';
