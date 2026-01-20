import { readdir, stat } from 'fs/promises';
import { join, extname, normalize } from 'path';

export interface PdfFileInfo {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: Date;
}

export interface ScanResult {
  files: PdfFileInfo[];
  skipped: Array<{ fileName: string; reason: string }>;
  directoryPath: string;
}

/**
 * Scans a directory for PDF files, filtering out temporary/invalid files.
 * Returns files sorted by filename ascending for deterministic processing.
 */
export async function scanDirectoryForPdfs(directoryPath: string): Promise<ScanResult> {
  const normalizedPath = normalize(directoryPath);
  const entries = await readdir(normalizedPath, { withFileTypes: true });
  
  const files: PdfFileInfo[] = [];
  const skipped: Array<{ fileName: string; reason: string }> = [];
  
  for (const entry of entries) {
    // Skip directories
    if (entry.isDirectory()) {
      continue;
    }
    
    const fileName = entry.name;
    const filePath = join(normalizedPath, fileName);
    
    // Check if it's a PDF file (case-insensitive)
    const ext = extname(fileName).toLowerCase();
    if (ext !== '.pdf') {
      continue;
    }
    
    // Skip temporary files (starting with ~$ or .)
    if (fileName.startsWith('~$') || fileName.startsWith('.')) {
      skipped.push({ fileName, reason: 'Temporary file (starts with ~$ or .)' });
      continue;
    }
    
    // Get file stats
    const fileStat = await stat(filePath);
    
    // Skip zero-byte files
    if (fileStat.size === 0) {
      skipped.push({ fileName, reason: 'Zero-byte file' });
      continue;
    }
    
    files.push({
      filePath,
      fileName,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime,
    });
  }
  
  // Sort by filename ascending for deterministic order
  files.sort((a, b) => a.fileName.localeCompare(b.fileName));
  
  return {
    files,
    skipped,
    directoryPath: normalizedPath,
  };
}

/**
 * Validates that a directory exists and is accessible.
 */
export async function validateDirectory(directoryPath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const normalizedPath = normalize(directoryPath);
    const dirStat = await stat(normalizedPath);
    
    if (!dirStat.isDirectory()) {
      return { valid: false, error: `Path is not a directory: ${normalizedPath}` };
    }
    
    return { valid: true };
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return { valid: false, error: `Directory does not exist: ${directoryPath}` };
      }
      if (nodeError.code === 'EACCES') {
        return { valid: false, error: `Permission denied: ${directoryPath}` };
      }
    }
    return { valid: false, error: `Cannot access directory: ${directoryPath}` };
  }
}
