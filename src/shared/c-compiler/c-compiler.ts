import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const armCompilerPath = path.join(__dirname, 'arm');

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
 * Utility class for compiling C code to object files
 */
export class CCompiler {
  /**
   * Compiles C code to an object file.
   * @param functionName - Name of the function being compiled (used for file naming)
   * @param cCode - The C source code to compile
   * @param contextPath - Path to the context.h file containing type definitions
   * @param flags - Compiler flags to pass to agbcc
   */
  async compile(
    functionName: string,
    cCode: string,
    contextPath: string,
    flags: string,
  ): Promise<
    { success: true; objPath: string } | { success: false; errorMessage: string; compilationErrors: CompilationError[] }
  > {
    const srcPath = path.join(armCompilerPath, `${functionName}.c`);
    const objPath = path.join(armCompilerPath, `${functionName}.o`);

    // Write C source file in compiler directory
    try {
      await fs.writeFile(srcPath, cCode);

      // Run the compile script
      const compileScript = path.join(armCompilerPath, 'compile.sh');
      execSync(`bash "${compileScript}" "${functionName}" "${contextPath}" "${flags}"`, {
        cwd: armCompilerPath,
        stdio: 'pipe',
      });

      return { success: true, objPath };
    } catch (error) {
      if (error instanceof Error && error.message.match(/Command failed.*compile\.sh/)) {
        const preprocessedPath = path.join(armCompilerPath, `${functionName}_preprocessed.c`);

        const preprocessedSource = await fs.readFile(preprocessedPath, 'utf-8');
        const mizuchiConcatenatedMarkerLine =
          1 + preprocessedSource.split('\n').findIndex((line) => line.includes('_MIZUCHI_CONCATENATED_CODE'));

        return {
          success: false,
          errorMessage: 'Compilation failed',
          compilationErrors: formatCompilationError(error.message, mizuchiConcatenatedMarkerLine),
        };
      } else if (error instanceof Error) {
        return { success: false, errorMessage: error.message, compilationErrors: [] };
      } else {
        return { success: false, errorMessage: 'Unknown error', compilationErrors: [] };
      }
    } finally {
      // Clean up temporary files in compiler directory
      await Promise.allSettled([
        fs.unlink(srcPath),
        fs.unlink(path.join(armCompilerPath, `${functionName}.s`)),
        fs.unlink(path.join(armCompilerPath, `${functionName}_combined.c`)),
        fs.unlink(path.join(armCompilerPath, `${functionName}_combined_stripped.c`)),
        fs.unlink(path.join(armCompilerPath, `${functionName}_preprocessed.c`)),
      ]);
    }
  }
}
