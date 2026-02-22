# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mizuchi is a plugin-based pipeline runner for matching decompilation projects. It automates the cycle of generating C code (via Claude), compiling with agbcc (ARMv4T), and comparing against target binaries using objdiff. The pipeline automatically retries with rich error context when compilation or matching fails.

## Common Commands

```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# Build UIs
npm run build:run-report       # Build the Run Report UI (required for HTML reports)
npm run build:decomp-atlas     # Build the Decomp Atlas UI
npm run build:ui               # Build all UIs

# Run the pipeline
npm start                      # Uses mizuchi.yaml in current directory
npm start -- -c path/to/config.yaml

# Development
npm run dev                    # Run CLI directly with tsx
npm run dev:run-report -- ./benchmark-results-*.json  # Run Run Report dev server
npm run dev:decomp-atlas       # Run Decomp Atlas dev server

# Testing
npm test                       # Run all tests
npm run test:watch             # Watch mode
npx vitest run src/plugins/claude-runner  # Run specific test file/directory

# Quality checks
npm run check-types            # TypeScript type checking (includes all UIs)
npm run lint                   # ESLint
npm run format                 # Prettier
npm run check-deps             # Dependency graph validation
```

## Web UIs

Mizuchi includes two static React apps under `src/ui/`, sharing components and styles via `src/ui/shared/`.

### Run Report UI (`src/ui/run-report/`)

Visualizes pipeline benchmark results. Displays summary stats, per-prompt results with plugin flow diagrams, attempts charts, timeline Gantt charts, and syntax-highlighted code/chat sections.

- **Build**: `npm run build:run-report` — produces a self-contained `index.html` (via `vite-plugin-singlefile`)
- **Dev**: `npm run dev:run-report -- ./benchmark-results-*.json` — starts a Vite dev server that injects the JSON report data and hot-reloads on file changes

The pipeline generates HTML reports automatically using this UI via `src/report-generator/index.ts`.

### Decomp Atlas UI (`src/ui/decomp-atlas/`)

Loads a `kappa-db.json` file (exported from the Kappa VS Code extension) and visualizes the decompilation project state:

- **Embeddings scatter chart** — UMAP dimensionality reduction of function embeddings, rendered with Apache ECharts (canvas renderer for 14k+ points, native wheel zoom + drag pan via `dataZoom`). Points colored by decompilation status (pink = has C code, white = assembly only).
- **File tree sidebar** — browse and filter functions by source path
- **Vector similarity** — `KappaDb` class (`src/shared/kappa-db.ts`) provides brute-force cosine similarity search over normalized embeddings

Usage:

- **Build**: `npm run build:decomp-atlas` — produces a standalone `index.html`
- **Dev**: `npm run dev:decomp-atlas` — starts a Vite dev server on port 5173; drag-and-drop a `kappa-db.json` file to explore

## Architecture

### Plugin Pipeline

The system runs prompts through a sequential plugin pipeline with automatic retries:

```
Prompt Loader → Claude Runner → Compiler → Objdiff
                     ↑_______________|__________|
                         (retry on failure)
```

Each plugin implements the `Plugin<T>` interface from `src/shared/types.ts`:

- `execute(context)` - Run the plugin and return result + updated context
- `prepareRetry(context, previousAttempts)` - Prepare context for retry with error feedback
- `getReportSections(result, context)` - Generate report sections for the HTML report

### Key Components

- **PluginManager** (`src/plugin-manager.ts`) - Orchestrates plugin execution, retry logic, and context propagation
- **Claude Runner Plugin** (`src/plugins/claude-runner/`) - Uses Claude Agent SDK to generate C code, maintains conversation state across retries, caches responses. Provides an MCP tool (`compile_and_view_assembly`) that allows Claude to test-compile code and view assembly before submitting.
- **Compiler Plugin** (`src/plugins/compiler/`) - Compiles C code via `CCompiler` wrapper
- **Objdiff Plugin** (`src/plugins/objdiff/`) - Compares compiled object files using objdiff-wasm
- **Report Generator** (`src/report-generator/`) - Transforms results to JSON/HTML reports
- **Web UIs** (`src/ui/`) - Two static React apps (run-report, decomp-atlas) sharing components via `src/ui/shared/`

### Shared Services

- **ObjdiffService** (`src/shared/objdiff/`) - Singleton service for objdiff-wasm operations (parsing object files, extracting assembly, comparing symbols). Used by both ObjdiffPlugin and the Claude Runner's MCP tool.
- **CCompiler** (`src/shared/c-compiler/`) - Executes a shell script template (`compilerScript`) to compile C code to object files
- **KappaDb** (`src/shared/kappa-db.ts`) - Pure TypeScript loader for `kappa-db.json` dumps with brute-force vector similarity search

### Configuration

Configuration is YAML-based (`mizuchi.yaml`):

- `global` section: Pipeline-wide settings (`maxRetries`, `outputDir`, `contextPath`, `promptsDir`, `compilerScript`)
- `plugins` section: Per-plugin configuration (e.g., `claude-runner.projectPath`, `objdiff.diffSettings`)

Plugins validate their config using Zod schemas (e.g., `claudeRunnerConfigSchema`, `objdiffConfigSchema`).

### Prompt Structure

Each prompt lives in its own directory under `promptsDir`:

```
prompts/
  function-name/
    prompt.md         # The prompt sent to Claude
    settings.yaml     # functionName, targetObjectPath
```

### Path Aliases

- `~` → `./src` (all contexts: tsconfig.json, vitest.config.ts, rollup.config.js, vite configs)
- `@shared` → `./src/shared` (UI apps only: vite.config.ts + tsconfig.json)
- `@ui-shared` → `./src/ui/shared` (UI apps only: vite.config.ts + tsconfig.json)

## Testing

Tests use Vitest with the `.spec.ts` extension. Test utilities are in `src/shared/test-utils.ts`:

- `createTestContext()` - Creates a mock `PipelineContext`
- `defaultTestPipelineConfig` - Default config for tests

The Claude Runner plugin accepts a `queryFactory` parameter for dependency injection in tests.
