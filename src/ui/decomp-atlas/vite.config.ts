import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command === 'build' ? [viteSingleFile()] : [])],
  root: __dirname,
  resolve: {
    alias: {
      '~': path.resolve(__dirname, '../../../src'),
      '@shared': path.resolve(__dirname, '../../../src/shared'),
      '@ui-shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },
}));
