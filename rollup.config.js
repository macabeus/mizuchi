import alias from '@rollup/plugin-alias';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import fs from 'fs';
import path from 'path';
import copy from 'rollup-plugin-copy';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Recursively find all TypeScript files in a directory
 */
function findTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip report-generator/ui directory
      if (fullPath.includes('report-generator/ui')) continue;
      findTsFiles(fullPath, files);
    } else if (entry.isFile()) {
      // Include .ts and .tsx files, exclude test files
      if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.includes('.spec.') &&
        !entry.name.includes('.test.')
      ) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

// Find all TypeScript source files (excluding tests and report UI)
const inputFiles = findTsFiles('src');

// Create input object for Rollup (preserves directory structure)
const input = Object.fromEntries(
  inputFiles.map((file) => {
    // Remove 'src/' prefix and '.ts'/'.tsx' extension
    const name = file.replace(/^src\//, '').replace(/\.(ts|tsx)$/, '');
    return [name, file];
  }),
);

export default {
  input,
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true,
    // Preserve the directory structure
    preserveModules: true,
    preserveModulesRoot: 'src',
    // Ensure .js extension for ESM compatibility
    entryFileNames: '[name].js',
  },
  external: [
    // Node.js built-ins
    'child_process',
    'fs',
    'fs/promises',
    'path',
    'url',
    'os',
    // External dependencies (don't bundle these)
    '@anthropic-ai/claude-agent-sdk',
    '@wooorm/starry-night',
    'ink',
    'ink-spinner',
    'objdiff-wasm',
    'pastel',
    'react',
    'react-dom',
    'react/jsx-runtime',
    'yaml',
    'zod',
  ],
  plugins: [
    // Resolve ~/\* path aliases
    alias({
      entries: [{ find: /^~\/(.*)/, replacement: path.resolve(__dirname, 'src/$1') }],
    }),

    // Resolve node_modules
    resolve({
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    }),

    // Compile TypeScript
    typescript({
      tsconfig: './tsconfig.json',
      // Override some options for Rollup compatibility
      compilerOptions: {
        // Let Rollup handle module output
        module: 'ESNext',
        // Emit declaration files
        declaration: true,
        declarationDir: 'dist',
        // Enable sourcemaps for TypeScript
        sourceMap: true,
        inlineSources: true,
      },
      // Exclude test files and report UI
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/report-generator/ui/**/*',
        'node_modules/**/*',
      ],
    }),

    // Copy ARM compiler files to dist (copy the entire arm directory)
    copy({
      targets: [
        {
          src: 'src/shared/c-compiler/arm',
          dest: 'dist/shared/c-compiler',
        },
      ],
      hook: 'writeBundle',
    }),
  ],
  // Suppress warnings about circular dependencies in React
  onwarn(warning, warn) {
    // Ignore circular dependency warnings
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  },
};
