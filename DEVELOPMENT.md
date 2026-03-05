# Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run check-types

# Linting
npm run lint

# Format code
npm run format

# Run the pipeline in development mode
npm run dev -- run

# Run the Run Report UI in development mode
npm run dev:run-report -- ./run-results-[timestamp].json

# Run the Decomp Atlas API and UI in development mode
npm run dev:decomp-atlas -- --config mizuchi.yaml
```

## Known Issues

### Performance entry buffer overflow on long dev-mode runs

When running the pipeline in development mode (`npm run dev -- run`), Node.js may emit the following warning after several hours:

```
MaxPerformanceEntryBufferExceededWarning: 1000001 measure entries
```

**Cause:** In dev mode, `tsx` does not set `NODE_ENV=production`, so `react-reconciler` (used by [Ink](https://github.com/vadimdemedes/ink) for the terminal UI) loads its development build. The development build calls `performance.measure()` on every React render cycle for DevTools profiling. Over long pipeline runs, these entries accumulate in Node.js's global performance entry buffer until they exceed the 1M entry limit.

This profiling is intended for browser DevTools and serves no purpose in a headless CLI pipeline.

**Recommendation:** For long pipeline runs, use the production build:

```bash
npm run build
npm start -- run
```
