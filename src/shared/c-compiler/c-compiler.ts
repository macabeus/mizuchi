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
 * Uses a shell script template (`compilerScript`) with variable substitution:
 * - `{{cFilePath}}` — absolute path to the preprocessed .c file
 * - `{{objFilePath}}` — absolute path to the output .o file
 * - `{{functionName}}` — the function name being compiled
 */
export class CCompiler {
  #compilerScript: string;

  constructor(compilerScript: string) {
    this.#compilerScript = compilerScript;
  }

  /**
   * Compiles C code to an object file.
   * @param functionName - Name of the function being compiled (used for file naming)
   * @param cCode - The C source code to compile
   * @param contextPath - Path to the context.h file containing type definitions
   */
  async compile(
    functionName: string,
    cCode: string,
    contextPath: string,
  ): Promise<
    { success: true; objPath: string } | { success: false; errorMessage: string; compilationErrors: CompilationError[] }
  > {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-compile-'));
    const combinedPath = path.join(tmpDir, `${functionName}_combined.c`);
    const strippedPath = path.join(tmpDir, `${functionName}_stripped.c`);
    const preprocessedPath = path.join(tmpDir, `${functionName}_preprocessed.c`);
    const objPath = path.join(tmpDir, `${functionName}.o`);
    const scriptPath = path.join(tmpDir, `${functionName}_compile.sh`);

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

      // 3. Preprocess with cpp (system preprocessor — must not inherit custom env
      //    like COMPILER_PATH which would make it find the wrong cc1)
      const cppOptions = { stdio: 'pipe' as const };
      execSync(`cpp -P "${strippedPath}" "${preprocessedPath}"`, cppOptions);

      // 4. Substitute template variables and execute compiler script
      const renderedScript = this.#compilerScript
        .replaceAll('{{cFilePath}}', preprocessedPath)
        .replaceAll('{{objFilePath}}', objPath)
        .replaceAll('{{functionName}}', functionName);
      await fs.writeFile(scriptPath, 'set -e\n' + renderedScript);
      execSync(`bash "${scriptPath}"`, { cwd: tmpDir, stdio: 'pipe' });

      return { success: true, objPath };
    } catch (error) {
      if (error instanceof Error) {
        const stderr =
          'stderr' in error && Buffer.isBuffer((error as Record<string, unknown>).stderr)
            ? ((error as Record<string, unknown>).stderr as Buffer).toString().trim()
            : '';
        const rawError = stderr || error.message;

        try {
          const preprocessedSource = await fs.readFile(preprocessedPath, 'utf-8');
          const mizuchiConcatenatedMarkerLine =
            1 + preprocessedSource.split('\n').findIndex((line) => line.includes('_MIZUCHI_CONCATENATED_CODE'));

          const compilationErrors = formatCompilationError(rawError, mizuchiConcatenatedMarkerLine);
          return {
            success: false,
            errorMessage: compilationErrors.length ? 'Compilation failed' : rawError,
            compilationErrors,
          };
        } catch {
          return { success: false, errorMessage: rawError, compilationErrors: [] };
        }
      }
      return { success: false, errorMessage: 'Unknown error', compilationErrors: [] };
    } finally {
      // Clean up intermediates but keep .o (caller is responsible for it)
      await Promise.allSettled([
        fs.unlink(combinedPath),
        fs.unlink(strippedPath),
        fs.unlink(preprocessedPath),
        fs.unlink(scriptPath),
      ]);
    }
  }
}
