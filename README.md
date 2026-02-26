# Mizuchi

<img src="./media/branding/logo.png" align="right" height="130px" />

> A plugin-based pipeline runner for matching decompilation projects.

Mizuchi automates the cycle of writing C code, compiling, and comparing against a target binary.

It orchestrates a plugin-based pipeline that can leverage programmatic and AI-powered tools to automatically decompile assembly functions to C source code that produces byte-for-byte identical machine code when compiled.

- ✨ Automatic retries with detailed context on compilation or match failures
- 🐍 Integration with Claude, [m2c](https://github.com/matt-kempster/m2c), [decomp-permuter](https://github.com/simonlindholm/decomp-permuter), and [objdiff](https://github.com/encounter/objdiff/).
- 🗺️ Decomp Atlas, a powerful webapp to browse functions and generate rich prompts in one click
- 📊 Beautiful Report UI to visualize the pipeline result

<img width="1143" height="1057" alt="image" src="https://github.com/user-attachments/assets/025e6a00-7a6a-4425-9c11-8b86619cd546" />

<table align="center">
    <tr>
        <td align="center" width="50%">
          <kbd><img width="1015" height="839" alt="image" src="https://github.com/user-attachments/assets/79547f83-618b-4d91-8aeb-cfa0db59a5cc" /></kbd><br />
          <i>Achieve fully matching code automatically</i>
        </td>
        <td align="center" width="50%">
          <kbd><img alt="image" src="https://github.com/user-attachments/assets/689914f0-0392-4df6-8f74-5fbad01fb9e2" /></kbd><br />
          <i>Even partial matches provide a good start</i>
        </td>
    </tr>
</table>

> ⚙️ **What is Matching Decompilation?**
>
> Matching decompilation is the art of converting assembly back into C source code that, when compiled, produces byte-for-byte identical machine code. It's popular in the retro gaming community for recreating source code of classic games. For example, [Super Mario 64](https://github.com/n64decomp/sm64) and [The Legend of Zelda: Ocarina of Time](https://github.com/zeldaret/oot) have been fully match-decompiled.
>
> [Learn more by watching my talk.](https://www.youtube.com/watch?v=sF_Yk0udbZw)

---

> :warning: **Work in Progress**
>
> Mizuchi is currently focused on benchmarking LLM prompt effectiveness, with plans to become a general-purpose decompilation automation tool. Check the [issues tab](https://github.com/macabeus/mizuchi/issues) for planned features.

## Installation

```bash
npm install
npm run build && npm run build:ui
```

### m2c Setup (Optional)

To enable the m2c programmatic-flow phase:

```bash
git submodule update --init vendor/m2c
./scripts/setup-m2c.sh
```

### decomp-permuter Setup (Optional)

To enable decomp-permuter (brute-force mutation matching). Works both in the programmatic-flow phase and as background tasks during the AI-powered flow:

```bash
git submodule update --init vendor/decomp-permuter
./scripts/setup-decomp-permuter.sh
```

### Requirements

- `ANTHROPIC_API_KEY` environment variable set

## Quick Start

1. **Create a configuration file**:

```bash
cp mizuchi.example.yaml mizuchi.yaml
```

2. **Set up your prompts**:

Create the prompt directory following this structure:

```txt
prompts/
  my-function-1/
    prompt.md         # The prompt content
    settings.yaml     # Metadata (functionName, targetObjectPath)
  my-function-2/
    prompt.md
    settings.yaml
```

See the [Prompt Folder Structure](#prompt-folder-structure) section for details.

> **Tip**: Use the [Decomp Atlas](#decomp-atlas) to browse your project's functions and generate rich prompts from a web app.

3. **Run the benchmark**:

```bash
npm start
```

## Prompt Folder Structure

Each prompt is a folder containing two files. See the [`prompts/`](prompts/) directory for examples.

### `prompt.md`

The prompt sent to Claude. Should include:

- A request to decompile an assembly function to C
- The assembly code to decompile

### `settings.yaml`

Metadata for the prompt:

```yaml
functionName: my_function
targetObjectPath: /path/to/build/code.o
asm: |
  .text
  glabel my_function
      push {lr}
      bx lr
```

## Pipeline Overview

Mizuchi executes a pipeline of plugins:

```mermaid
flowchart TD
  A[Prompt Loader] --> |Load prompts from directory| O

  subgraph Setup Flow
    O[Get Context]
  end

  O --> M

  subgraph Programmatic Flow
    M[m2c]
    MC[Compiler]
    MP[decomp-permuter]

    M --> |Generate C| MC
    MC --> |Compile to object file| MP
    MP --> |Permute mutations| MD[Objdiff]
  end

  M --> |m2c error| B
  MC --> |Compilation Error| B
  MD --> |Match found| E[Success]
  MD --> |No match| B

  subgraph AI-Powered Flow
    B[Claude Runner]
    C[Compiler]
    D[Objdiff]
    BP[Background permuter]

    B --> |Generate C| C
    C --> |Compilation Error → Retry| B
    C --> |Compile to object file| D
    D --> |Improvement| BP
    D --> |Mismatch → Retry| B
  end

  BP -.-> |Match found| E
  D --> |Match found| E
  D --> |Max retries exceeded| F[Fail]
```

> 📌 **Roadmap**: See the [issues tab](https://github.com/macabeus/mizuchi/issues) for planned features.

## Output

Mizuchi generates three output files:

| File                                 | Description                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `benchmark-results-{timestamp}.json` | Complete execution data including plugin results, timing, and success/failure status |
| `benchmark-report-{timestamp}.html`  | Visual report with success rates, metrics, and per-prompt breakdown                  |
| `claude-cache.json`                  | Cached Claude API responses keyed by prompt content hash                             |

### Built-in Plugins

| Plugin              | Description                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **m2c**             | Optional: generates an initial C decompilation using [m2c](https://github.com/matt-kempster/m2c)                                        |
| **decomp-permuter** | Optional: brute-forces code mutations using [decomp-permuter](https://github.com/simonlindholm/decomp-permuter) to improve match scores |
| **Claude Runner**   | Sends prompts to Claude and processes responses                                                                                         |
| **Compiler**        | Compiles generated C code using a configurable shell script template                                                                    |
| **Objdiff**         | Compares compiled object files against targets using [objdiff](https://github.com/encounter/objdiff)                                    |

## Decomp Atlas

Decomp Atlas is a web UI for exploring your decompilation project and target the next functions to decompile. It includes a **prompt builder** that generates rich decompilation prompts.

### Starting the server

```bash
# Build the CLI and UI
npm run build && npm run build:decomp-atlas

# Start the Decomp Atlas server
npm start -- atlas -c mizuchi.yaml
```

The server reads your `mizuchi.yaml` config and serves the Decomp Atlas UI at `http://localhost:3000`.

> Note: Your project must have a `kappa-db.json` file in the root directory for the Decomp Atlas to work. This file is exported from the [Kappa](https://github.com/macabeus/kappa) VS Code extension.

## Development

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

# Run in development mode
npm run dev

# Run the Run Report UI in development mode
npm run dev:run-report -- ./benchmark-results-[timestamp].json

# Run the Decomp Atlas API and UI in development mode
npm run dev:decomp-atlas -- -c mizuchi.yaml
```
