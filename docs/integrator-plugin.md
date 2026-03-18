# Integrator Plugin

The Integrator plugin is an optional **post-match phase** plugin that automatically integrates matched C code into your decomp project. It runs after the pipeline produces a successful match, so it never modifies your project for failed attempts.

All work happens inside an isolated **git worktree**. The plugin never touches your main working tree.

## How it works

When a function matches successfully, the Integrator plugin:

1. Creates a git worktree branched from HEAD
2. Calls your **integrator module** (a JS file you write) to place the code
3. Optionally runs a **build verification** script to confirm the project still compiles
4. If the build fails and `aiBuildFix` is enabled, spawns a Claude session to fix the errors
5. Commits, pushes, and/or opens a PR depending on `autoAction`

## Configuration

Add the `integrator` section under `plugins` in your `mizuchi.yaml`:

```yaml
plugins:
  integrator:
    enable: true

    # Path to your integrator module (relative to project root)
    integratorModule: ./mizuchi-integrator.mjs

    # Shell script to verify the build after integration (optional)
    # Template variable: {{worktreePath}}
    verifyBuildScript: |
      cd {{worktreePath}} && make compare

    # How far automation goes: "commit", "push", or "pr" (default: "commit")
    autoAction: commit

    # Commit message template. Template variable: {{functionName}}
    commitMessageTemplate: 'match {{functionName}}'

    # Branch name template. Template variables: {{functionName}}, {{timestamp}}
    branchTemplate: 'mizuchi/{{functionName}}'

    # PR settings (used when autoAction is "pr")
    pr:
      title: 'Match {{functionName}}'
      body: 'Matched `{{functionName}}` via Mizuchi.'

    # AI-powered build fix (optional, default: disabled)
    aiBuildFix:
      enable: true
      timeoutMs: 300000 # 5 minutes
      # model: sonnet     # Override the Claude model used for fixing
```

### `autoAction` chain

| Value    | Behavior                                   |
| -------- | ------------------------------------------ |
| `commit` | Commit changes in the worktree             |
| `push`   | Commit + push the branch to `origin`       |
| `pr`     | Commit + push + open a PR via the `gh` CLI |

Each step is additive. If any step fails, the plugin reports the error and stops.

### Build verification

If `verifyBuildScript` is set, it runs inside the worktree after the integrator module finishes. The script should exit 0 on success and non-zero on failure. `set -e` is prepended automatically, so any failing command aborts the build.

When the build fails and `aiBuildFix.enable` is `true`, the plugin spawns a Claude Agent SDK session scoped to the worktree. The AI agent can read and edit files, run shell commands, and re-run the build until it passes or the timeout is reached.

### Git worktree lifecycle

Worktrees are created under the system temp directory (`/tmp/mizuchi-integrator/`). On success, the worktree contains the committed (and optionally pushed) changes. On failure, the worktree is left on disk for debugging. Over many runs you may want to clean up stale worktrees:

```bash
cd /path/to/your/project
git worktree prune
```

## Writing the integrator module

The integrator module is a JavaScript file that exports an `integrate` function. This is where you define how decompiled code gets placed into your specific project structure.

### Function signature

```js
/**
 * @param {Object} params
 * @param {string} params.functionName - Name of the matched function
 * @param {string} params.generatedCode - The C code that produced a successful match
 * @param {string} params.worktreePath - Absolute path to the git worktree
 * @param {string} params.projectRoot - Absolute path to the main project directory
 * @param {IntegratorHelpers} params.helpers - Utility functions for common integration tasks
 * @returns {Promise<{ filesModified: string[], summary: string }>}
 */
export async function integrate({ functionName, generatedCode, worktreePath, projectRoot, helpers }) {
  // ...
}
```

**Parameters:**

| Name            | Type                | Description                                                                                            |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `functionName`  | `string`            | The name of the matched function (e.g. `FUN_08000960`)                                                 |
| `generatedCode` | `string`            | The C code that produced a successful match                                                            |
| `worktreePath`  | `string`            | Absolute path to the git worktree. All file operations should target this directory, not the main tree |
| `projectRoot`   | `string`            | Absolute path to the main project directory. Useful for copying build artifacts into the worktree      |
| `helpers`       | `IntegratorHelpers` | Utility functions for common integration tasks (see below)                                             |

**Return value:**

| Field           | Type       | Description                                                  |
| --------------- | ---------- | ------------------------------------------------------------ |
| `filesModified` | `string[]` | List of files that were modified (for the commit and report) |
| `summary`       | `string`   | Human-readable summary shown in the run report               |

### Helpers API

The `helpers` object provides utilities for common decomp project patterns:

#### `helpers.findSourceFile(functionName: string): string`

Searches all `.c` files under `<worktreePath>/src/` for an `INCLUDE_ASM` or `#pragma GLOBAL_ASM` stub referencing the given function name. Returns the absolute path to the file.

Throws if no matching stub is found.

#### `helpers.replaceIncludeAsm(filePath: string, functionName: string, code: string): void`

Replaces an `INCLUDE_ASM("...", functionName);` call in the given file with the provided C code. Handles flexible whitespace. Other stubs in the same file are left untouched.

Throws if the stub is not found.

#### `helpers.replacePragmaGlobalAsm(filePath: string, functionName: string, code: string): void`

Replaces a `#pragma GLOBAL_ASM("...functionName...")` directive with the provided C code. The function name is matched anywhere in the path string inside the pragma.

Throws if the pragma is not found.

#### `helpers.stripDuplicateDeclarations(filePath: string, code: string): string`

Removes forward/extern declarations from `code` for functions that are already declared or defined in the target file. Only strips declarations that appear before the first `{` in the code, so function bodies are never modified.

This is useful when multiple decompiled functions reference the same external symbol — without stripping, you'd get duplicate declaration errors.

Returns the cleaned code.

#### `helpers.exec(command: string, options?: { timeout?: number }): string`

Runs a shell command with `cwd` set to the worktree. Returns stdout as a string. Throws on non-zero exit. Default timeout is 120 seconds.

#### `helpers.log(message: string): void`

Logs a message that will appear in the plugin output section of the run report.

### Important: worktree setup

Git worktrees are **sparse by design** — they contain tracked files but not gitignored build artifacts, generated files, or submodule contents. If your project's build depends on any of these, your integrator module must copy or symlink them into the worktree before the build verification runs.

Common things you may need to set up:

- **Gitignored build artifacts** (ROMs, object files, generated headers): copy from `projectRoot`
- **Submodules** (compilers, tools): symlink from `projectRoot` since submodule dirs are empty in worktrees
- **Generated assembly files**: copy or rsync from `projectRoot`

### Example

A typical decomp project using `INCLUDE_ASM`:

```js
// mizuchi-integrator.mjs
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function integrate({ functionName, generatedCode, worktreePath, projectRoot, helpers }) {
  // 1. Copy gitignored build artifacts into the worktree
  fs.copyFileSync(path.join(projectRoot, 'baserom.bin'), path.join(worktreePath, 'baserom.bin'));

  // 2. Symlink submodules (empty placeholder dirs in worktrees)
  for (const sub of ['tools/compiler']) {
    const src = path.join(projectRoot, sub);
    const dest = path.join(worktreePath, sub);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.symlinkSync(src, dest);
  }

  // 3. Find the source file and replace the stub
  const srcFile = helpers.findSourceFile(functionName);
  const cleanedCode = helpers.stripDuplicateDeclarations(srcFile, generatedCode);
  helpers.replaceIncludeAsm(srcFile, functionName, cleanedCode);

  helpers.log(`Replaced INCLUDE_ASM for ${functionName}`);

  return {
    filesModified: [srcFile],
    summary: `Integrated ${functionName}`,
  };
}
```

For projects using `#pragma GLOBAL_ASM`, replace step 3 with:

```js
const srcFile = helpers.findSourceFile(functionName);
helpers.replacePragmaGlobalAsm(srcFile, functionName, generatedCode);
```

### Custom logic

The integrator module is plain JavaScript — you can do anything beyond the helpers. Common patterns:

- **Move assembly files** from `nonmatchings/` to `matchings/` after a successful match
- **Run project-specific scripts** (e.g., `make ctx`) via `helpers.exec()` or Node's `execSync`
- **Patch linker scripts** or symbol files
