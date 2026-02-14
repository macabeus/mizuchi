/**
 * m2c Wrapper
 *
 * Shared class wrapping the m2c decompiler.
 * Invokes m2c as a Python subprocess to decompile assembly into C code.
 */
import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface M2cOptions {
  /** Assembly content in GAS format */
  asmContent: string;
  /** Name of the function to decompile */
  functionName: string;
  /** m2c target architecture */
  target: 'mips' | 'mipsel' | 'mipsee' | 'ppc' | 'arm' | 'gba';
  /** Optional path to C context file for type hints */
  contextPath?: string;
}

export interface M2cResult {
  success: boolean;
  /** Generated C code on success */
  code?: string;
  /** Error message on failure */
  error?: string;
}

/**
 * Wrapper class for the m2c decompiler
 */
export class M2c {
  #m2cDir: string;
  #pythonPath: string;

  constructor() {
    // Resolve vendor/m2c relative to the package root
    // From src/shared/ -> ../../vendor/m2c
    // From dist/shared/ -> ../../vendor/m2c
    this.#m2cDir = path.resolve(__dirname, '..', '..', 'vendor', 'm2c');
    this.#pythonPath = path.join(this.#m2cDir, '.venv', 'bin', 'python');
  }

  /**
   * Decompile assembly into C code using m2c
   */
  async decompile(options: M2cOptions): Promise<M2cResult> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'm2c-'));
    const asmFile = path.join(tmpDir, `${options.functionName}.s`);

    try {
      await fs.writeFile(asmFile, options.asmContent, 'utf-8');

      const args = [
        path.join(this.#m2cDir, 'm2c.py'),
        asmFile,
        '--target',
        options.target,
        '--function',
        options.functionName,
        '--globals',
        'none',
      ];

      if (options.contextPath) {
        args.push('--context', options.contextPath);
      }

      const result = await this.#exec(this.#pythonPath, args);

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr || result.stdout || `m2c exited with code ${result.exitCode}`,
        };
      }

      const code = result.stdout.trim();
      if (!code) {
        return {
          success: false,
          error: 'm2c produced no output',
        };
      }

      return { success: true, code };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  #exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      execFile(command, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({
            stdout: '',
            stderr: `m2c Python venv not found at ${this.#pythonPath}. Run 'bash scripts/setup-m2c.sh' to set up m2c.`,
            exitCode: 1,
          });
          return;
        }
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? ((error as any).status ?? 1) : 0,
        });
      });
    });
  }
}
