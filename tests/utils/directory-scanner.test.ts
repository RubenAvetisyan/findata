import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanDirectoryForPdfs, validateDirectory } from '@findata/boa-parser';

describe('directory-scanner', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `boa-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('validateDirectory', () => {
    it('should return valid for existing directory', async () => {
      const result = await validateDirectory(testDir);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for non-existent directory', async () => {
      const result = await validateDirectory(join(testDir, 'nonexistent'));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should return invalid for file path', async () => {
      const filePath = join(testDir, 'file.txt');
      await writeFile(filePath, 'test');
      const result = await validateDirectory(filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a directory');
    });
  });

  describe('scanDirectoryForPdfs', () => {
    it('should find PDF files in directory', async () => {
      await writeFile(join(testDir, 'statement1.pdf'), 'dummy pdf content');
      await writeFile(join(testDir, 'statement2.pdf'), 'dummy pdf content');
      await writeFile(join(testDir, 'readme.txt'), 'not a pdf');

      const result = await scanDirectoryForPdfs(testDir);
      
      expect(result.files).toHaveLength(2);
      expect(result.files[0]?.fileName).toBe('statement1.pdf');
      expect(result.files[1]?.fileName).toBe('statement2.pdf');
    });

    it('should sort files by filename ascending', async () => {
      await writeFile(join(testDir, 'c-march.pdf'), 'content');
      await writeFile(join(testDir, 'a-january.pdf'), 'content');
      await writeFile(join(testDir, 'b-february.pdf'), 'content');

      const result = await scanDirectoryForPdfs(testDir);
      
      expect(result.files).toHaveLength(3);
      expect(result.files[0]?.fileName).toBe('a-january.pdf');
      expect(result.files[1]?.fileName).toBe('b-february.pdf');
      expect(result.files[2]?.fileName).toBe('c-march.pdf');
    });

    it('should skip temporary files starting with ~$', async () => {
      await writeFile(join(testDir, '~$temp.pdf'), 'temp content');
      await writeFile(join(testDir, 'normal.pdf'), 'normal content');

      const result = await scanDirectoryForPdfs(testDir);
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.fileName).toBe('normal.pdf');
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.reason).toContain('Temporary file');
    });

    it('should skip hidden files starting with .', async () => {
      await writeFile(join(testDir, '.hidden.pdf'), 'hidden content');
      await writeFile(join(testDir, 'visible.pdf'), 'visible content');

      const result = await scanDirectoryForPdfs(testDir);
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.fileName).toBe('visible.pdf');
      expect(result.skipped).toHaveLength(1);
    });

    it('should skip zero-byte files', async () => {
      await writeFile(join(testDir, 'empty.pdf'), '');
      await writeFile(join(testDir, 'nonempty.pdf'), 'content');

      const result = await scanDirectoryForPdfs(testDir);
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.fileName).toBe('nonempty.pdf');
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.reason).toContain('Zero-byte');
    });

    it('should handle case-insensitive PDF extension', async () => {
      await writeFile(join(testDir, 'lower.pdf'), 'content');
      await writeFile(join(testDir, 'upper.PDF'), 'content');
      await writeFile(join(testDir, 'mixed.Pdf'), 'content');

      const result = await scanDirectoryForPdfs(testDir);
      
      expect(result.files).toHaveLength(3);
    });

    it('should return empty array for directory with no PDFs', async () => {
      await writeFile(join(testDir, 'doc.txt'), 'text');
      await writeFile(join(testDir, 'image.png'), 'image');

      const result = await scanDirectoryForPdfs(testDir);
      
      expect(result.files).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });

    it('should include file size and modification time', async () => {
      const content = 'test pdf content';
      await writeFile(join(testDir, 'test.pdf'), content);

      const result = await scanDirectoryForPdfs(testDir);
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.sizeBytes).toBe(content.length);
      expect(result.files[0]?.modifiedAt).toBeInstanceOf(Date);
    });
  });
});
