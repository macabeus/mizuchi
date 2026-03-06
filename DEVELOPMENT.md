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

**Cause:** `react-reconciler` (used by [Ink](https://github.com/vadimdemedes/ink) for the terminal UI) checks `process.env.NODE_ENV` at require-time to decide which build to load. The development build calls `performance.measure()` on every React render cycle for DevTools profiling — with the Spinner component re-rendering every 80ms, this accumulates over 1M entries during long pipeline runs.

The production build (`npm start`) sets `NODE_ENV=production`, which loads `react-reconciler.production.js` — this build has zero `performance.measure()` calls and no buffer accumulation.

In dev mode (`npm run dev`), `NODE_ENV` is not set, so the development build loads by default. This is fine for short test runs but will trigger the warning on multi-hour runs.

**Recommendation:** For long pipeline runs, always use the production build:

```bash
npm run build
npm start -- run
```
