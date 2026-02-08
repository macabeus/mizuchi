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

  /**
   * Convert objdiff assembly output to GAS-compatible format for m2c.
   *
   * Objdiff produces lines like:
   *   0:    push {r4, r5, r6, r7, lr}
   *   4:    ldr r0, [pc, #0x54] # REFERENCE_.L5c
   *   .L8:
   *   8:    ldr r0, [r4, #0x0]
   *   5c:   .word 0x30000c4
   *
   * m2c expects GAS format with =symbol pool loads:
   *   .text
   *   glabel functionName
   *       push {r4, r5, r6, r7, lr}
   *       ldr r0, =0x30000c4
   *   .L8:
   *       ldr r0, [r4, #0x0]
   *
   * @param literalPoolOverrides - Optional map of function-relative addresses to symbol names,
   *   used when the objdiff display doesn't include literal pool data (e.g., from ELF relocations).
   */
  static convertObjdiffAsmToGas(
    assembly: string,
    functionName: string,
    literalPoolOverrides: Map<number, string> = new Map(),
  ): string {
    const lines = assembly.split('\n');
    const gasLines: string[] = ['.text', `glabel ${functionName}`];

    // Pass 1: Collect literal pool entries from the display
    // These are .word/.hword directives that appear after the instructions
    const literalPool = new Map<number, string>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const addrMatch = trimmed.match(/^([0-9a-fA-F]+):\s*/);
      if (!addrMatch) {
        continue;
      }
      const addr = parseInt(addrMatch[1], 16);
      const content = trimmed.replace(/^[0-9a-fA-F]+:\s*/, '');

      // Match .word <value> directives (literal pool entries)
      const wordMatch = content.match(/^\.word\s+(0x[0-9a-fA-F]+|\d+)$/);
      if (wordMatch) {
        literalPool.set(addr, wordMatch[1]);
      }
    }

    // Merge overrides (ELF relocation data) for addresses not in the display
    for (const [addr, value] of literalPoolOverrides) {
      if (!literalPool.has(addr)) {
        literalPool.set(addr, value);
      }
    }

    // Pass 2: Convert instructions
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      // Labels (.LXX:) - keep as-is
      if (/^\.\w+:/.test(trimmed)) {
        gasLines.push(trimmed);
        continue;
      }

      // Strip address prefix (e.g., "0:", "4:", "1c:")
      let stripped = trimmed.replace(/^[0-9a-fA-F]+:\s*/, '');

      // Skip literal pool directives (.word, .hword) - already collected
      if (/^\.(word|hword|short)\s/.test(stripped)) {
        continue;
      }

      // Convert PC-relative loads with REFERENCE annotations to =value syntax
      // The REFERENCE gives us a label like .L5c (address 0x5c in the literal pool).
      // We look up the actual value from the literal pool data.
      const refMatch = stripped.match(/^(ldr\s+\w+),\s*\[pc,\s*#0x[0-9a-fA-F]+\]\s*# REFERENCE_\.L([0-9a-fA-F]+)/);
      if (refMatch) {
        const poolAddr = parseInt(refMatch[2], 16);
        const poolValue = literalPool.get(poolAddr);
        if (poolValue) {
          stripped = `${refMatch[1]}, =${poolValue}`;
        } else {
          // No literal pool data available - strip REFERENCE and keep raw instruction
          stripped = stripped.replace(/\s*# REFERENCE_\S*/, '');
        }
      } else {
        // Handle non-.L REFERENCE annotations (direct symbol references)
        const directRefMatch = stripped.match(/^(ldr\s+\w+),\s*\[pc,\s*#0x[0-9a-fA-F]+\]\s*# REFERENCE_(\S+)/);
        if (directRefMatch) {
          stripped = `${directRefMatch[1]}, =${directRefMatch[2]}`;
        } else {
          // Strip any remaining REFERENCE annotations on non-ldr-pc instructions
          stripped = stripped.replace(/\s*# REFERENCE_\S*/, '');
        }
      }

      // Strip relocation addends from bl/blx targets
      // (e.g., "bl VramFree-0x4" → "bl VramFree")
      // These addends are ARM/Thumb PC-relative encoding artifacts from objdiff
      stripped = stripped.replace(/^(blx?\s+\w+)[+-]0x[0-9a-fA-F]+/, '$1');

      if (stripped) {
        gasLines.push(`    ${stripped}`);
      }
    }

    return gasLines.join('\n') + '\n';
  }

  /**
   * Read ELF relocations for a function's literal pool entries.
   * Returns a map of function-relative addresses to symbol names.
   */
  async getRelocationsForFunction(objectFilePath: string, functionName: string): Promise<Map<number, string>> {
    const result = new Map<number, string>();

    // Get the function's address in the .text section
    const symResult = await this.#exec('arm-none-eabi-readelf', ['-s', '-W', objectFilePath]);
    if (symResult.exitCode !== 0) {
      return result;
    }

    // Find the function symbol to get its address
    let funcAddr = -1;
    for (const line of symResult.stdout.split('\n')) {
      if (line.includes(functionName) && /FUNC/.test(line)) {
        const match = line.match(/:\s*([0-9a-fA-F]+)\s/);
        if (match) {
          // Clear Thumb bit (bit 0) to get actual address
          funcAddr = parseInt(match[1], 16) & ~1;
          break;
        }
      }
    }
    if (funcAddr < 0) {
      return result;
    }

    // Get relocations
    const relResult = await this.#exec('arm-none-eabi-readelf', ['-r', '-W', objectFilePath]);
    if (relResult.exitCode !== 0) {
      return result;
    }

    // Parse R_ARM_ABS32 relocations near the function's literal pool
    for (const line of relResult.stdout.split('\n')) {
      const match = line.match(/^([0-9a-fA-F]+)\s+[0-9a-fA-F]+\s+R_ARM_ABS32\s+[0-9a-fA-F]+\s+(\S+)/);
      if (match) {
        const absAddr = parseInt(match[1], 16);
        const symbolName = match[2];
        // Check if this relocation is within the function's likely literal pool range
        // (within 256 bytes after the function start)
        const relativeAddr = absAddr - funcAddr;
        if (relativeAddr > 0 && relativeAddr < 0x200) {
          result.set(relativeAddr, symbolName);
        }
      }
    }

    return result;
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
