/**
 * decomp-permuter Wrapper
 *
 * Shared class wrapping the decomp-permuter tool.
 * Invokes decomp-permuter as a Python subprocess to brute-force code mutations
 * that improve the match percentage against a target binary.
 */
import { type ChildProcess, spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import type { PlatformTarget } from '~/shared/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Toolchain binaries and flags for a given platform target.
 * Used by the objdump wrapper to find the right cross-toolchain binaries.
 */
export interface ToolchainInfo {
  /** Candidate nm binary names, tried in order (first found wins) */
  nmCandidates: string[];
  /** Candidate objdump binary names, tried in order (first found wins) */
  objdumpCandidates: string[];
  /** Architecture-specific objdump flags (e.g. ['-drz'] for ARM, ['-drz', '-m', 'mips:4300'] for MIPS) */
  objdumpFlags: string[];
  /** Default permuter compiler_type for randomization weights */
  defaultCompilerType: 'base' | 'ido' | 'mwcc' | 'gcc';
}

/**
 * Map platform targets to cross-toolchain binaries and flags.
 *
 * Candidate lists match decomp-permuter's own ArchSettings in src/objdump.py
 * so the wrapper finds the same binaries the permuter would use natively.
 */
export function getToolchainForTarget(target: PlatformTarget): ToolchainInfo {
  switch (target) {
    // ARM targets
    case 'gba':
    case 'nds':
    case 'n3ds':
      return {
        nmCandidates: ['arm-none-eabi-nm'],
        objdumpCandidates: ['arm-none-eabi-objdump'],
        objdumpFlags: ['-drz'],
        defaultCompilerType: 'gcc',
      };

    // MIPS targets
    case 'n64':
    case 'ps1':
    case 'ps2':
    case 'psp':
    case 'irix':
      return {
        nmCandidates: ['mips-linux-gnu-nm', 'mips64-linux-gnu-nm', 'mips64-elf-nm'],
        objdumpCandidates: ['mips-linux-gnu-objdump', 'mips64-linux-gnu-objdump', 'mips64-elf-objdump'],
        objdumpFlags: ['-drz', '-m', 'mips:4300'],
        defaultCompilerType: 'ido',
      };

    // PowerPC targets
    case 'gc':
    case 'wii':
      return {
        nmCandidates: ['powerpc-eabi-nm'],
        objdumpCandidates: ['powerpc-eabi-objdump'],
        objdumpFlags: ['-dr', '-EB', '-mpowerpc', '-M', 'broadway'],
        defaultCompilerType: 'mwcc',
      };

    // SuperH targets
    case 'saturn':
    case 'dreamcast':
      return {
        nmCandidates: ['sh-elf-nm'],
        objdumpCandidates: ['sh-elf-objdump'],
        objdumpFlags: ['-drz'],
        defaultCompilerType: 'gcc',
      };

    // Fallback: system toolchain
    default:
      return {
        nmCandidates: ['nm'],
        objdumpCandidates: ['objdump'],
        objdumpFlags: ['-drz'],
        defaultCompilerType: 'gcc',
      };
  }
}

export interface DecompPermuterOptions {
  /** C source code (single function) to permute */
  cCode: string;
  /** Path to the target object file (.o) for comparison */
  targetObjectPath: string;
  /** Name of the function being decompiled */
  functionName: string;
  /** Compiler script template with {{cFilePath}}, {{objFilePath}}, {{functionName}} placeholders */
  compilerScript: string;
  /** Platform target — used to resolve cross-toolchain binaries (nm, objdump) */
  target: PlatformTarget;
  /** Permuter compiler_type for randomization weights (e.g. 'gcc', 'ido', 'mwcc') */
  compilerType: string;
  /** Context content (type definitions etc.) to prepend during compilation */
  contextContent?: string;
  /** Maximum number of iterations before stopping. When omitted, runs until perfect match, timeout, or abort. */
  maxIterations?: number;
  /** Maximum time in milliseconds before stopping */
  timeoutMs: number;
  /** Optional abort signal to cancel the permuter process */
  signal?: AbortSignal;
  /** Additional flags to pass to permuter.py (e.g. ['--stack-diffs', '-j', '4']) */
  flags?: string[];
}

export type DecompPermuterLogEntry =
  | { type: 'base-score'; value: number }
  | { type: 'better-score'; value: number }
  | { type: 'new-best'; value: number }
  | { type: 'progress'; value: number };

export interface DecompPermuterResult {
  perfectMatch: boolean;
  baseScore: number;
  bestScore: number;
  iterationsRun: number;
  bestCode?: string;
  /** Unified diff showing the mutations applied by the permuter */
  bestDiff?: string;
  error?: string;
  /** Raw stdout from the permuter process */
  stdout: string;
  /** Raw stderr from the permuter process */
  stderr: string;
}

/**
 * Kill all processes in a process group and schedule a forced stdio cleanup.
 *
 * When spawned with `detached: true`, the child gets its own process group.
 * Sending a signal to `-pid` targets the entire group. However, on macOS
 * Python's `multiprocessing` (default `spawn` start method) creates workers
 * in NEW process groups, so their subprocesses (e.g. compiler invocations)
 * survive the group kill. These orphaned grandchildren inherit the pipe FDs,
 * preventing Node.js's ChildProcess `close` event from firing.
 *
 * After a brief grace period (to let the dying process flush its last output),
 * we force-destroy stdout/stderr so the Node.js side closes cleanly regardless
 * of orphaned processes holding the write end.
 */
function killProcessGroup(proc: ChildProcess): void {
  if (proc.pid) {
    try {
      process.kill(-proc.pid);
    } catch {
      // Process already exited or group doesn't exist
    }
  }
  // Force-close pipes after a grace period. The timer is unref'd so it
  // doesn't prevent Node.js from exiting if nothing else keeps the loop alive.
  const timer = setTimeout(() => {
    proc.stdout?.destroy();
    proc.stderr?.destroy();
  }, 1000);
  timer.unref();
}

/**
 * Wrapper class for the decomp-permuter tool
 */
export class DecompPermuter {
  #permuterDir: string;
  #pythonPath: string;

  constructor() {
    // Resolve vendor/decomp-permuter relative to the package root
    // From src/shared/ -> ../../vendor/decomp-permuter
    // From dist/shared/ -> ../../vendor/decomp-permuter
    this.#permuterDir = path.resolve(__dirname, '..', '..', 'vendor', 'decomp-permuter');
    this.#pythonPath = path.join(this.#permuterDir, '.venv', 'bin', 'python');
  }

  /**
   * Run decomp-permuter on a C function, trying mutations to improve the match.
   *
   * Sets up a working directory with the required structure (base.c, target.o,
   * compile.sh, settings.toml), then runs permuter.py for brute-force mutations.
   */
  async run(options: DecompPermuterOptions): Promise<DecompPermuterResult> {
    let permuterProcess: ChildProcess | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let workingDir: string | null = null;

    try {
      // Step 1: Set up the working directory with all files permuter.py needs
      workingDir = await this.#setupWorkingDir(options);

      // Step 2: Write our Mizuchi-compatible compile.sh
      await this.#writeCompileScript(workingDir, options);

      // Step 3: Run permuter.py and stream results
      const flags = options.flags ?? [];
      permuterProcess = spawn(this.#pythonPath, [path.join(this.#permuterDir, 'permuter.py'), ...flags, workingDir], {
        cwd: this.#permuterDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      // Kill the process if the abort signal fires
      if (options.signal) {
        if (options.signal.aborted) {
          killProcessGroup(permuterProcess);
        } else {
          options.signal.addEventListener(
            'abort',
            () => {
              if (permuterProcess) {
                killProcessGroup(permuterProcess);
              }
            },
            { once: true },
          );
        }
      }

      // Track the exit code so we can detect failures
      let exitCode: number | null = null;
      permuterProcess.on('exit', (code) => {
        exitCode = code;
      });

      // #streamOutput captures raw stdout/stderr and parses events in one place.
      const capture = { stdoutChunks: [] as string[], stderrChunks: [] as string[] };

      let baseScore = -1;
      let bestScore = -1;
      let perfectMatch = false;
      let lastIterationSeen = 0;

      // parsedEvents counts \n-delimited score messages (base-score, better-score,
      // new-best) recognized by the stream parser. Used to enforce maxIterations
      // as a "stop after N score events" limit.
      let parsedEvents = 0;
      const iterationLimit = options.maxIterations ?? Infinity;

      // Set up timeout
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
          if (permuterProcess) {
            killProcessGroup(permuterProcess);
          }
          resolve();
        }, options.timeoutMs);
      });

      const streamPromise = (async () => {
        for await (const entry of this.#streamOutput(permuterProcess!, capture)) {
          if (entry.type === 'progress') {
            if (entry.value > lastIterationSeen) {
              lastIterationSeen = entry.value;
            }
            continue;
          }

          if (entry.type === 'base-score') {
            baseScore = entry.value;
            bestScore = entry.value;
          } else if (entry.type === 'better-score' || entry.type === 'new-best') {
            if (entry.value < bestScore || bestScore === -1) {
              bestScore = entry.value;
            }
            if (entry.value === 0) {
              perfectMatch = true;
              if (permuterProcess) {
                killProcessGroup(permuterProcess);
              }
              break;
            }
          }

          parsedEvents++;
          if (parsedEvents >= iterationLimit) {
            if (permuterProcess) {
              killProcessGroup(permuterProcess);
            }
            break;
          }
        }
      })();

      await Promise.race([streamPromise, timeoutPromise]);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // If the process exited with a non-zero code and we never got a base score,
      // surface the error from stderr so callers can diagnose the failure.
      const stderr = capture.stderrChunks.join('');
      if (baseScore === -1 && exitCode !== null && exitCode !== 0) {
        return {
          perfectMatch: false,
          baseScore: -1,
          bestScore: -1,
          iterationsRun: 0,
          error: stderr.trim() || `permuter.py exited with code ${exitCode}`,
          stdout: capture.stdoutChunks.join(''),
          stderr,
        };
      }

      // Read the best code and diff if we found an improvement
      let bestCode: string | undefined;
      let bestDiff: string | undefined;
      if (bestScore < baseScore && bestScore >= 0 && workingDir) {
        const bestOutput = await this.#readBestOutput(workingDir, bestScore);
        bestCode = bestOutput.code;
        bestDiff = bestOutput.diff;
      }

      return {
        perfectMatch,
        baseScore,
        bestScore: bestScore >= 0 ? bestScore : baseScore,
        iterationsRun: lastIterationSeen,
        bestCode,
        bestDiff,
        stdout: capture.stdoutChunks.join(''),
        stderr,
      };
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (permuterProcess) {
        killProcessGroup(permuterProcess);
      }

      return {
        perfectMatch: false,
        baseScore: -1,
        bestScore: -1,
        iterationsRun: 0,
        error: error instanceof Error ? error.message : String(error),
        stdout: '',
        stderr: '',
      };
    } finally {
      // Clean up the working directory
      if (workingDir) {
        await fs.rm(workingDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  /**
   * Set up the permuter working directory with all files permuter.py needs:
   *   - context.h:          Context content (type definitions, macros)
   *   - base.c:             Generated code with #include "context.h"
   *   - target.o:           target object file for comparison
   *   - settings.toml:      permuter settings (func_name, compiler_type, objdump_command)
   *   - objdump_wrapper.sh: Custom objdump that extracts only the target function
   *
   * Context is kept in a separate file so the permuter only mutates the
   * generated function code, not the type definitions. The permuter's own
   * preprocess step (cpp -P -nostdinc) resolves the include for pycparser.
   * compile.sh uses -I to resolve the #include at compile time.
   */
  async #setupWorkingDir(options: DecompPermuterOptions): Promise<string> {
    const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-permuter-'));

    // Write context as a separate header so the permuter won't mutate it
    const contextContent = options.contextContent || '';
    await fs.writeFile(path.join(workingDir, 'context.h'), contextContent);

    // Write base.c: include context + generated code only
    const baseC = `#include "context.h"\n${options.cCode}`;
    await fs.writeFile(path.join(workingDir, 'base.c'), baseC);

    // Copy the target object file
    await fs.copyFile(options.targetObjectPath, path.join(workingDir, 'target.o'));

    // Write objdump wrapper that extracts only the target function,
    // using the correct cross-toolchain binaries for the platform target
    const toolchain = getToolchainForTarget(options.target);
    const wrapperPath = await this.#writeObjdumpWrapper(workingDir, options.functionName, toolchain);

    // Write settings.toml with the function name, compiler type for
    // randomization weights, and custom objdump command with arch-specific flags.
    const objdumpFlags = toolchain.objdumpFlags.join(' ');
    const settingsContent = `func_name = "${options.functionName}"\ncompiler_type = "${options.compilerType}"\nobjdump_command = "${wrapperPath} ${objdumpFlags}"\n`;
    await fs.writeFile(path.join(workingDir, 'settings.toml'), settingsContent);

    return workingDir;
  }

  /**
   * Write a Mizuchi-compatible compile.sh into the permuter working directory.
   *
   * The permuter calls compile.sh with the C source path as $1.
   * compile.sh needs to:
   * 1. Strip block comments (old compilers may not support them)
   * 2. Preprocess with cpp -P
   * 3. Run the user's compiler script
   *
   * Note: The permuter always regenerates source from AST via to_c(), even for
   * the base case. This output already contains all context.h content inlined
   * (resolved during the permuter's own preprocessing step), so we must NOT
   * prepend #include "context.h" here — doing so would cause redefinition errors.
   */
  async #writeCompileScript(workingDir: string, options: DecompPermuterOptions): Promise<void> {
    // Render the compiler script with template variables
    // In the compile.sh, $TMPDIR/preprocessed.c is the final input, $OBJFILE is the output
    const renderedCompilerScript = options.compilerScript
      .replaceAll('{{cFilePath}}', '"$TMPDIR/preprocessed.c"')
      .replaceAll('{{objFilePath}}', '"$OBJFILE"')
      .replaceAll('{{functionName}}', options.functionName);

    // The permuter calls: compile.sh <c_file> -o <o_file>
    // $1 = C source file, $2 = "-o", $3 = output object file
    // We cd into TMPDIR before compiling so intermediate files (e.g. asm.s from agbcc)
    // are written there instead of cwd, avoiding conflicts with concurrent runs.
    const compileScript = `#!/bin/bash
set -e
CFILE="$(realpath "$1")"
OBJFILE="$(realpath "$3")"
TMPDIR="$(mktemp -d)"

# Strip block comments (old compilers like agbcc may not support them)
perl -0777 -pe 's|/\\*.*?\\*/||gs' "$CFILE" > "$TMPDIR/stripped.c"

# Preprocess
cpp -P "$TMPDIR/stripped.c" "$TMPDIR/preprocessed.c"

# Compile (cd into tmpdir so intermediate files don't conflict)
cd "$TMPDIR"
${renderedCompilerScript}

# Cleanup
rm -rf "$TMPDIR"
`;

    const compileShPath = path.join(workingDir, 'compile.sh');
    await fs.writeFile(compileShPath, compileScript, { mode: 0o755 });
  }

  /**
   * Write an objdump wrapper script that extracts only the target function
   * from multi-function object files.
   *
   * The decomp-permuter's scorer runs objdump on both candidate and target .o
   * files. When target.o contains many functions, the scorer compares ALL
   * assembly — producing huge scores dominated by unrelated functions.
   *
   * This wrapper finds the correct cross-toolchain nm/objdump at runtime
   * (trying multiple candidate names), uses nm to find the target function's
   * address boundaries, then passes --start-address/--stop-address to objdump
   * so only that function is disassembled. For single-function .o files (like
   * the candidate), the function starts at 0x0 with no next symbol, so the
   * wrapper is effectively a no-op.
   */
  async #writeObjdumpWrapper(workingDir: string, functionName: string, toolchain: ToolchainInfo): Promise<string> {
    const nmCandidatesStr = toolchain.nmCandidates.map((c) => `"${c}"`).join(' ');
    const objdumpCandidatesStr = toolchain.objdumpCandidates.map((c) => `"${c}"`).join(' ');

    const wrapperScript = `#!/bin/bash
# Objdump wrapper: disassembles only the target function from .o files.
# Usage: objdump_wrapper.sh [objdump-flags...] <object-file>
#
# Finds the correct cross-toolchain nm/objdump by trying candidate binaries,
# then extracts the last argument as the .o file path, looks up the function's
# address range via nm, and passes --start-address/--stop-address to objdump.

FUNC_NAME="${functionName}"
NM_CANDIDATES=(${nmCandidatesStr})
OBJDUMP_CANDIDATES=(${objdumpCandidatesStr})

# Find the first available nm binary
NM_CMD=""
for candidate in "\${NM_CANDIDATES[@]}"; do
  if command -v "\$candidate" &>/dev/null; then
    NM_CMD="\$candidate"
    break
  fi
done
if [ -z "\$NM_CMD" ]; then
  echo "Error: No suitable nm found. Tried: \${NM_CANDIDATES[*]}" >&2
  exit 1
fi

# Find the first available objdump binary
OBJDUMP_CMD=""
for candidate in "\${OBJDUMP_CANDIDATES[@]}"; do
  if command -v "\$candidate" &>/dev/null; then
    OBJDUMP_CMD="\$candidate"
    break
  fi
done
if [ -z "\$OBJDUMP_CMD" ]; then
  echo "Error: No suitable objdump found. Tried: \${OBJDUMP_CANDIDATES[*]}" >&2
  exit 1
fi

# Collect all arguments; the last one is the object file
ARGS=("\$@")
OBJ_FILE="\${ARGS[\${#ARGS[@]}-1]}"
OBJDUMP_ARGS=("\${ARGS[@]:0:\${#ARGS[@]}-1}")

# Look up function boundaries using nm
# nm --numeric-sort lists symbols sorted by address; grep " T " filters global text symbols.
NM_OUTPUT=\$("\$NM_CMD" --numeric-sort "\$OBJ_FILE" 2>/dev/null | grep " T ")

if [ -z "\$NM_OUTPUT" ]; then
  # No global text symbols found — fall back to unfiltered objdump
  exec "\$OBJDUMP_CMD" "\${OBJDUMP_ARGS[@]}" "\$OBJ_FILE"
fi

# Find the line for our function
FUNC_LINE=\$(echo "\$NM_OUTPUT" | grep " T \$FUNC_NAME\$")

if [ -z "\$FUNC_LINE" ]; then
  # Function not found as a global symbol — fall back to unfiltered objdump
  exec "\$OBJDUMP_CMD" "\${OBJDUMP_ARGS[@]}" "\$OBJ_FILE"
fi

# Extract the start address (first field)
START_ADDR=\$(echo "\$FUNC_LINE" | awk '{print \$1}')

# Find the next symbol at a strictly greater address.
# We skip all lines at the same address as our function, then take the
# first line with a different address. This handles decomp projects (e.g.
# N64 with asm-processor) that emit .NON_MATCHING alias symbols at the
# same address — using grep -A1 would pick up the alias and produce
# start == stop, which objdump rejects.
# nm --numeric-sort guarantees ordering, so the first different address
# after our function's block is always greater.
NEXT_ADDR=\$(echo "\$NM_OUTPUT" | awk -v addr="\$START_ADDR" '
  found && \$1 != addr { print \$1; exit }
  \$1 == addr { found = 1 }
')

if [ -n "\$NEXT_ADDR" ]; then
  exec "\$OBJDUMP_CMD" "\${OBJDUMP_ARGS[@]}" --start-address="0x\$START_ADDR" --stop-address="0x\$NEXT_ADDR" "\$OBJ_FILE"
else
  # Our function is the last (or only) symbol — no stop address needed
  exec "\$OBJDUMP_CMD" "\${OBJDUMP_ARGS[@]}" --start-address="0x\$START_ADDR" "\$OBJ_FILE"
fi
`;

    const wrapperPath = path.join(workingDir, 'objdump_wrapper.sh');
    await fs.writeFile(wrapperPath, wrapperScript, { mode: 0o755 });
    return wrapperPath;
  }

  /**
   * Parse streaming output from permuter.py.
   *
   * Captures raw stdout/stderr into `capture` while yielding parsed events.
   */
  async *#streamOutput(
    process: ChildProcess,
    capture: { stdoutChunks: string[]; stderrChunks: string[] },
  ): AsyncGenerator<DecompPermuterLogEntry> {
    let lineBuffer = '';
    let processEnded = false;

    const events: DecompPermuterLogEntry[] = [];
    let resolveNext: ((done: boolean) => void) | null = null;

    const enqueue = (event: DecompPermuterLogEntry) => {
      events.push(event);
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve(false);
      }
    };

    const parseLine = (line: string) => {
      const baseMatch = line.match(/base score = (?<value>\d+)/);
      if (baseMatch?.groups?.value) {
        enqueue({ type: 'base-score', value: Number(baseMatch.groups.value) });
        return;
      }

      const betterMatch = line.match(/found a better score! \((?<value>\d+)/);
      if (betterMatch?.groups?.value) {
        enqueue({ type: 'better-score', value: Number(betterMatch.groups.value) });
        return;
      }

      const newBestMatch = line.match(/new best score! \((?<value>\d+)/);
      if (newBestMatch?.groups?.value) {
        enqueue({ type: 'new-best', value: Number(newBestMatch.groups.value) });
        return;
      }
    };

    const processChunk = (text: string) => {
      // Extract iteration count from \r-delimited progress lines.
      // Yield only the highest iteration in this chunk to avoid flooding.
      let maxIter = 0;
      for (const match of text.matchAll(/iteration (\d+)/g)) {
        const n = Number(match[1]);
        if (n > maxIter) {
          maxIter = n;
        }
      }
      if (maxIter > 0) {
        enqueue({ type: 'progress', value: maxIter });
      }

      // Split on \n for score messages
      lineBuffer += text;
      const newLines = lineBuffer.split('\n');
      lineBuffer = newLines.pop() || '';
      for (const line of newLines) {
        parseLine(line);
      }
    };

    process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      capture.stdoutChunks.push(text);
      processChunk(text);
    });
    // Swallow errors from force-destroyed pipes (see killProcessGroup)
    process.stdout?.on('error', () => {});

    process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      capture.stderrChunks.push(text);
      processChunk(text);
    });
    // Swallow errors from force-destroyed pipes (see killProcessGroup)
    process.stderr?.on('error', () => {});

    process.on('close', () => {
      processEnded = true;
      if (lineBuffer.trim()) {
        parseLine(lineBuffer);
      }
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve(true);
      }
    });

    process.on('error', () => {
      processEnded = true;
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve(true);
      }
    });

    while (!processEnded || events.length > 0) {
      if (events.length > 0) {
        yield events.shift()!;
      } else if (!processEnded) {
        const done = await new Promise<boolean>((resolve) => {
          resolveNext = resolve;
        });
        if (done && events.length === 0) {
          break;
        }
      } else {
        break;
      }
    }
  }

  /**
   * Read the best permuted output from the permuter's output directory.
   * The permuter stores results in output-<score>-<index>/ with:
   *   - source.c: full preprocessed source (for recompilation)
   *   - diff.txt: unified diff showing mutations applied (for display)
   */
  async #readBestOutput(workingDir: string, bestScore: number): Promise<{ code?: string; diff?: string }> {
    try {
      const entries = await fs.readdir(workingDir);
      // Find output directories matching the best score
      const outputDirs = entries.filter((e) => e.startsWith(`output-${bestScore}-`)).sort();

      if (outputDirs.length === 0) {
        return {};
      }

      // Read from the first (lowest index) match
      const outputDir = path.join(workingDir, outputDirs[0]);

      const [code, diff] = await Promise.all([
        fs.readFile(path.join(outputDir, 'source.c'), 'utf-8').catch(() => undefined),
        fs.readFile(path.join(outputDir, 'diff.txt'), 'utf-8').catch(() => undefined),
      ]);

      return { code, diff };
    } catch {
      return {};
    }
  }
}
