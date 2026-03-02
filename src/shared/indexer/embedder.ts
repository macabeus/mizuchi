/**
 * Python Embedding Subprocess Manager
 *
 * Manages a long-running Python process that loads jina-embeddings-v2-base-code
 * and embeds text batches via stdin/stdout JSON lines protocol.
 *
 * Auto-creates a Python venv at ~/.cache/mizuchi/python-venv/ on first use.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

import type { PlatformTarget } from '~/shared/config';

import { extractAsmFunctionBody, stripCommentaries } from './asm-utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VENV_DIR = path.join(os.homedir(), '.cache', 'mizuchi', 'python-venv');
const VENV_PYTHON = path.join(VENV_DIR, 'bin', 'python');
const EMBED_SERVER_PY = path.join(__dirname, 'embed-server.py');

const REQUIRED_PACKAGES = ['torch', 'transformers>=4.45,<5'];

/**
 * Result from the Python embedding server.
 */
interface EmbedServerMessage {
  type: 'ready' | 'result' | 'error';
  dimension?: number;
  device?: string;
  embeddings?: number[][];
  message?: string;
}

const BATCH_SIZE = 8;

/**
 * Preprocess assembly code before embedding.
 * Strips comments, extracts the function body, and normalizes format differences
 * between objdiff-extracted assembly (matched functions) and raw .s files (unmatched).
 */
export function preprocessForEmbedding(platform: PlatformTarget, asmCode: string): string {
  const stripped = stripCommentaries(asmCode);
  const body = extractAsmFunctionBody(platform, stripped);
  return normalizeAsmForEmbedding(body);
}

/**
 * Thumb instructions that carry an `s` (set-flags) suffix in GNU assembler
 * syntax but appear without it in objdiff's unified ARM output.
 * We normalize to the shorter form so both sources look the same.
 */
const THUMB_S_MNEMONICS = new Set([
  'adds',
  'subs',
  'movs',
  'lsls',
  'lsrs',
  'asrs',
  'ands',
  'orrs',
  'eors',
  'negs',
  'muls',
  'bics',
  'mvns',
  'rsbs',
  'sbcs',
  'adcs',
  'rors',
]);

/**
 * Normalize assembly format differences that cause the embedding model to
 * cluster by source format rather than code semantics.
 *
 * Objdiff output has:  "0:       ldr r1, [pc, #0x4] # REFERENCE_.L8"
 * Raw .s files have:   "ldr r0, _080994A8"
 *
 * We normalize:
 * 1. Hex address prefixes (e.g., "0:", "1a:", "2c:")
 * 2. "# REFERENCE_..." annotations
 * 3. Line number annotations that objdiff embeds before instructions
 * 4. Thumb `s` suffixes (adds → add, movs → mov, etc.)
 * 5. Data directives (.4byte → .word)
 * 6. Constant pool references: label-based → pc-relative style
 * 7. ROM-address label definitions at pool entries
 */
function normalizeAsmForEmbedding(asm: string): string {
  return asm
    .split('\n')
    .map((line): string | null => {
      let normalized = line;

      // Strip hex address prefix at the start of a line (e.g., "0:       " or "1a:      ")
      normalized = normalized.replace(/^[0-9a-f]+:\s*/, '');

      // Strip "# REFERENCE_..." annotations
      normalized = normalized.replace(/\s*#\s*REFERENCE_\S*/, '');

      // Strip line number annotations that appear before instructions (e.g., "27add" → "add")
      normalized = normalized.replace(/^\d+([\w.])/, '$1');

      // Normalize .4byte → .word (equivalent data directives)
      normalized = normalized.replace(/\.4byte\b/, '.word');

      // Normalize constant pool label references in load instructions:
      //   "ldr r0, _08003DB0" → "ldr r0, [pool]"
      normalized = normalized.replace(/^(ldr\w*\s+r\d+),\s*_[0-9a-fA-F]{7,8}\b/, '$1, [pool]');

      // Normalize PC-relative loads to the same generic form:
      //   "ldr r0, [pc, #0x14]" → "ldr r0, [pool]"
      normalized = normalized.replace(/^(ldr\w*\s+r\d+),\s*\[pc,\s*#0x[0-9a-fA-F]+\]/, '$1, [pool]');

      // Normalize ROM-address label definitions at pool entries:
      //   "_08003DB0: .word gStageData" → ".word gStageData"
      normalized = normalized.replace(/^_[0-9a-fA-F]{7,8}:\s*/, '');

      // Normalize Thumb s-suffix instructions (adds → add, movs → mov, etc.)
      const spaceIdx = normalized.indexOf(' ');
      const mnemonic = spaceIdx !== -1 ? normalized.substring(0, spaceIdx) : normalized;
      if (THUMB_S_MNEMONICS.has(mnemonic)) {
        normalized = mnemonic.slice(0, -1) + normalized.substring(spaceIdx);
      }

      // Strip MIPS `nonmatching` directive (macro from macro.inc, only in unmatched .s files)
      if (/^nonmatching\s/.test(normalized)) {
        return null;
      }

      // Strip MIPS register $ prefix: $a0 → a0, $sp → sp, $31 → 31, $fv0 → fv0, $ft3 → ft3
      normalized = normalized.replace(
        /\$(zero|at|v[01]|a[0-3]|t[0-9]|s[0-7]|k[01]|gp|sp|fp|ra|f[vtsa]\d|f\d{1,2}|\d{1,2})\b/g,
        '$1',
      );

      // Normalize .L hex labels: .L8086F350 → .Lx, .L2c11 → .Lx
      normalized = normalized.replace(/\.L[0-9a-fA-F]+\b/g, '.Lx');

      // Normalize MIPS relocations to generic form:
      //   %hi(symbol+offset) → %hi(x), %lo(symbol+offset) → %lo(x)
      normalized = normalized.replace(/%hi\([^)]+\)/g, '%hi(x)');
      normalized = normalized.replace(/%lo\([^)]+\)/g, '%lo(x)');
      //   (0xHEX >> 16) → %hi(x)
      normalized = normalized.replace(/\(0x[0-9a-fA-F]+ >> 16\)/g, '%hi(x)');
      //   (0xHEX & 0xFFFF) → %lo(x)
      normalized = normalized.replace(/\(0x[0-9a-fA-F]+ & 0xFFFF\)/g, '%lo(x)');

      return normalized;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

/**
 * Check if the Python venv exists and has the required packages.
 */
async function isVenvReady(): Promise<boolean> {
  try {
    await fs.access(VENV_PYTHON);
  } catch {
    return false;
  }

  try {
    const proc = spawn(VENV_PYTHON, ['-c', 'import torch; import transformers; print("ok")'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return new Promise((resolve) => {
      let output = '';
      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      proc.on('close', (code) => {
        resolve(code === 0 && output.trim() === 'ok');
      });
      proc.on('error', () => resolve(false));
    });
  } catch {
    return false;
  }
}

/**
 * Find a suitable python3 binary (>= 3.10).
 */
async function findPython(): Promise<string> {
  for (const candidate of ['python3', 'python']) {
    try {
      const proc = spawn(candidate, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const version = await new Promise<string>((resolve, reject) => {
        let output = '';
        proc.stdout.on('data', (data: Buffer) => {
          output += data.toString();
        });
        proc.stderr.on('data', (data: Buffer) => {
          output += data.toString();
        });
        proc.on('close', () => resolve(output.trim()));
        proc.on('error', reject);
      });

      const match = version.match(/Python (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        if (major >= 3 && minor >= 10) {
          return candidate;
        }
      }
    } catch {
      // Try next candidate
    }
  }

  throw new Error('Python 3.10+ required for embedding generation. Install Python 3.10 or newer.');
}

/**
 * Set up the Python virtual environment with required packages.
 */
export async function setupPythonVenv(onProgress?: (message: string) => void): Promise<void> {
  if (await isVenvReady()) {
    return;
  }

  onProgress?.('Setting up Python environment for embeddings (one-time setup)...');

  const python = await findPython();

  // Create venv
  await fs.mkdir(path.dirname(VENV_DIR), { recursive: true });
  onProgress?.('Creating Python virtual environment...');

  await runCommand(python, ['-m', 'venv', VENV_DIR]);

  // Install packages
  const pip = path.join(VENV_DIR, 'bin', 'pip');
  onProgress?.(`Installing ${REQUIRED_PACKAGES.join(', ')}... (this may take a few minutes)`);

  await runCommand(pip, ['install', '--upgrade', 'pip'], { silent: true });
  await runCommand(pip, ['install', ...REQUIRED_PACKAGES]);

  // Verify
  if (!(await isVenvReady())) {
    throw new Error('Python venv setup failed: packages not importable after install');
  }

  onProgress?.('Python environment ready.');
}

/**
 * Run a command and wait for it to complete.
 */
function runCommand(command: string, args: string[], options: { silent?: boolean } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: options.silent ? 'ignore' : ['ignore', 'inherit', 'inherit'],
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Manages the Python embedding subprocess.
 */
export class Embedder {
  #process: ChildProcessWithoutNullStreams | null = null;
  #rl: readline.Interface | null = null;
  #dimension = 0;
  #device = 'unknown';
  #pendingResolve: ((msg: EmbedServerMessage) => void) | null = null;
  #stderrBuffer: string[] = [];

  get dimension(): number {
    return this.#dimension;
  }

  get device(): string {
    return this.#device;
  }

  /**
   * Start the Python embedding server.
   * Sets up venv if needed, then spawns the process.
   */
  async start(onProgress?: (message: string) => void): Promise<void> {
    await setupPythonVenv(onProgress);

    onProgress?.('Starting embedding server...');

    this.#process = spawn(VENV_PYTHON, [EMBED_SERVER_PY], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.#stderrBuffer = [];

    // Forward stderr to progress callback and buffer for error reporting
    this.#process.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        this.#stderrBuffer.push(msg);
        onProgress?.(msg);
      }
    });

    this.#rl = readline.createInterface({
      input: this.#process.stdout,
      crlfDelay: Infinity,
    });

    this.#rl.on('line', (line: string) => {
      try {
        const msg = JSON.parse(line) as EmbedServerMessage;
        if (this.#pendingResolve) {
          const resolve = this.#pendingResolve;
          this.#pendingResolve = null;
          resolve(msg);
        }
      } catch {
        // Ignore non-JSON lines
      }
    });

    // Wait for ready signal
    const readyMsg = await this.#waitForMessage();
    if (readyMsg.type !== 'ready') {
      throw new Error(`Expected ready message, got: ${readyMsg.type}`);
    }

    this.#dimension = readyMsg.dimension ?? 0;
    this.#device = readyMsg.device ?? 'unknown';
  }

  /**
   * Embed a batch of texts.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.#process) {
      throw new Error('Embedder not started. Call start() first.');
    }

    const msg = JSON.stringify({ type: 'batch', texts }) + '\n';
    this.#process.stdin.write(msg);

    const result = await this.#waitForMessage();

    if (result.type === 'error') {
      throw new Error(`Embedding error: ${result.message}`);
    }

    if (result.type !== 'result' || !result.embeddings) {
      throw new Error(`Unexpected message type: ${result.type}`);
    }

    return result.embeddings;
  }

  /**
   * Embed all texts, processing in fixed-size batches.
   */
  async embedAll(texts: string[], onProgress?: (current: number, total: number) => void): Promise<number[][]> {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const embeddings = await this.embedBatch(batch);
      allEmbeddings.push(...embeddings);
      onProgress?.(i + batch.length, texts.length);
    }

    return allEmbeddings;
  }

  /**
   * Stop the embedding server.
   */
  async stop(): Promise<void> {
    if (!this.#process) {
      return;
    }

    try {
      this.#process.stdin.write(JSON.stringify({ type: 'done' }) + '\n');
    } catch {
      // Process may already be dead
    }

    this.#rl?.close();
    this.#rl = null;

    // Give it a moment to exit gracefully, then force kill
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.#process?.kill('SIGKILL');
        resolve();
      }, 5000);

      this.#process!.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.#process = null;
  }

  /**
   * Wait for the next JSON message from the Python process.
   */
  #waitForMessage(): Promise<EmbedServerMessage> {
    return new Promise((resolve, reject) => {
      if (!this.#process) {
        reject(new Error('Process not running'));
        return;
      }

      this.#pendingResolve = resolve;

      // Timeout after 5 minutes (model loading can be slow on first run)
      const timeout = setTimeout(() => {
        this.#pendingResolve = null;
        reject(new Error('Timeout waiting for Python embedding server response'));
      }, 300_000);

      // Handle process exit
      const exitHandler = (code: number | null) => {
        clearTimeout(timeout);
        this.#pendingResolve = null;
        const lastStderr = this.#stderrBuffer.slice(-10).join('\n');
        const detail = lastStderr ? `\n\nPython stderr:\n${lastStderr}` : '';
        reject(new Error(`Python embedding server exited with code ${code}${detail}`));
      };

      this.#process.once('close', exitHandler);

      // Clean up the exit handler once we get a response
      const originalResolve = this.#pendingResolve;
      this.#pendingResolve = (msg) => {
        clearTimeout(timeout);
        this.#process?.removeListener('close', exitHandler);
        originalResolve(msg);
      };
    });
  }
}
