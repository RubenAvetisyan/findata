import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@findata/types': path.resolve(__dirname, 'packages/types/src/index.ts'),
      '@findata/pdf-extract': path.resolve(__dirname, 'packages/pdf-extract/src/index.ts'),
      '@findata/categorizer': path.resolve(__dirname, 'packages/categorizer/src/index.ts'),
      '@findata/categorizer-ml': path.resolve(__dirname, 'packages/categorizer-ml/src/index.ts'),
      '@findata/boa-parser': path.resolve(__dirname, 'packages/boa-parser/src/index.ts'),
      '@findata/output': path.resolve(__dirname, 'packages/output/src/index.ts'),
      '@findata/plaid-bridge': path.resolve(__dirname, 'packages/plaid-bridge/src/index.ts'),
      '@findata/store': path.resolve(__dirname, 'packages/store/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'tests'],
    },
  },
});
