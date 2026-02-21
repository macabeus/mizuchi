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

# Build the report UI (required for HTML reports)
npm run build:report-ui

# Run the pipeline
npm start                      # Uses mizuchi.yaml in current directory
npm start -- -c path/to/config.yaml

# Development
npm run dev                    # Run CLI directly with tsx
npm run dev:report-ui -- ./benchmark-results-*.json  # Run report UI dev server

# Testing
npm test                       # Run all tests
npm run test:watch             # Watch mode
npx vitest run src/plugins/claude-runner  # Run specific test file/directory

# Quality checks
npm run check-types            # TypeScript type checking (includes report UI)
npm run lint                   # ESLint
npm run format                 # Prettier
npm run check-deps             # Dependency graph validation
```

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
- **Report Generator** (`src/report-generator/`) - Transforms results to JSON/HTML reports with a React UI

### Shared Services

- **ObjdiffService** (`src/shared/objdiff/`) - Singleton service for objdiff-wasm operations (parsing object files, extracting assembly, comparing symbols). Used by both ObjdiffPlugin and the Claude Runner's MCP tool.
- **CCompiler** (`src/shared/c-compiler/`) - Executes a shell script template (`compilerScript`) to compile C code to object files

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

The codebase uses `~` as an alias for `./src` in imports. Configured in tsconfig.json, vitest.config.ts, and rollup.config.js.

## Testing

Tests use Vitest with the `.spec.ts` extension. Test utilities are in `src/shared/test-utils.ts`:

- `createTestContext()` - Creates a mock `PipelineContext`
- `defaultTestPipelineConfig` - Default config for tests

The Claude Runner plugin accepts a `queryFactory` parameter for dependency injection in tests.
