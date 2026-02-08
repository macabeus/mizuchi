import { execSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type CompilationError = {
  line: number;
  message: string;
};

function formatCompilationError(rawError: string, contextFileLinesCount: number): CompilationError[] {
  const errors: CompilationError[] = [];
  const lines = rawError.split('\n');

  for (const line of lines) {
    // Match pattern: filepath:line: message
    const match = line.match(/^(.+?):(\d+):\s*(.+)$/);

    if (match) {
      const [, _file, lineNum, message] = match;
      errors.push({
        line: parseInt(lineNum, 10) - contextFileLinesCount,
        message: message.trim(),
      });
    }
  }

  return errors;
}

/**
 * Utility class for compiling C code to object files.
 *
 * Supports two modes:
 * - Two-step (assemblerPath provided): compiler produces .s, then assembler produces .o
 *   (e.g., agbcc + arm-none-eabi-as)
 * - Single-step (no assemblerPath): compiler produces .o directly (e.g., gcc)
 */
export class CCompiler {
  #compilerPath: string;
  #assemblerPath?: string;
  #env?: Record<string, string>;

  constructor(compilerPath: string, assemblerPath?: string, env?: Record<string, string>) {
    this.#compilerPath = compilerPath;
    this.#assemblerPath = assemblerPath;
    this.#env = env;
  }

  /**
   * Compiles C code to an object file.
   * @param functionName - Name of the function being compiled (used for file naming)
   * @param cCode - The C source code to compile
   * @param contextPath - Path to the context.h file containing type definitions
   * @param flags - Compiler flags
   */
  async compile(
    functionName: string,
    cCode: string,
    contextPath: string,
    flags: string,
  ): Promise<
    { success: true; objPath: string } | { success: false; errorMessage: string; compilationErrors: CompilationError[] }
  > {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-compile-'));
    const combinedPath = path.join(tmpDir, `${functionName}_combined.c`);
    const strippedPath = path.join(tmpDir, `${functionName}_stripped.c`);
    const preprocessedPath = path.join(tmpDir, `${functionName}_preprocessed.c`);
    const asmPath = path.join(tmpDir, `${functionName}.s`);
    const objPath = path.join(tmpDir, `${functionName}.o`);

    try {
      // 1. Concatenate context file + marker + source
      let contextContent = '';
      if (contextPath) {
        try {
          contextContent = await fs.readFile(contextPath, 'utf-8');
        } catch {
          // Empty context if file doesn't exist
        }
      }
      const combined = contextContent + '\nextern void _MIZUCHI_CONCATENATED_CODE();\n' + cCode;
      await fs.writeFile(combinedPath, combined);

      // 2. Strip block comments (/* ... */) that old compilers don't support
      const stripped = combined.replace(/\/\*[\s\S]*?\*\//g, '');
      await fs.writeFile(strippedPath, stripped);

      // 3. Preprocess with cpp
      const execOptions = { stdio: 'pipe' as const, env: this.#env ? { ...process.env, ...this.#env } : undefined };
      execSync(`cpp -P "${strippedPath}" "${preprocessedPath}"`, execOptions);

      // 4. Compile
      if (this.#assemblerPath) {
        // Two-step: compile to .s, then assemble to .o
        execSync(`"${this.#compilerPath}" "${preprocessedPath}" -o "${asmPath}" ${flags}`, execOptions);
        execSync(`"${this.#assemblerPath}" "${asmPath}" -o "${objPath}"`, execOptions);
      } else {
        // Single-step: compile directly to .o
        execSync(`"${this.#compilerPath}" ${flags} -c "${preprocessedPath}" -o "${objPath}"`, execOptions);
      }

      return { success: true, objPath };
    } catch (error) {
      if (error instanceof Error) {
        try {
          const preprocessedSource = await fs.readFile(preprocessedPath, 'utf-8');
          const mizuchiConcatenatedMarkerLine =
            1 + preprocessedSource.split('\n').findIndex((line) => line.includes('_MIZUCHI_CONCATENATED_CODE'));

          return {
            success: false,
            errorMessage: 'Compilation failed',
            compilationErrors: formatCompilationError(error.message, mizuchiConcatenatedMarkerLine),
          };
        } catch {
          return { success: false, errorMessage: error.message, compilationErrors: [] };
        }
      }
      return { success: false, errorMessage: 'Unknown error', compilationErrors: [] };
    } finally {
      // Clean up intermediates but keep .o (caller is responsible for it)
      await Promise.allSettled([
        fs.unlink(combinedPath),
        fs.unlink(strippedPath),
        fs.unlink(preprocessedPath),
        fs.unlink(asmPath),
      ]);
    }
  }
}
