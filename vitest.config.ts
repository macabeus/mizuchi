import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    testTimeout: 30000,
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
    // Disable file parallelism to avoid race conditions with shared compiler output directory
    fileParallelism: false,
  },
});
