import { execSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import type { SourceLanguage } from '~/shared/config';

type CompilationError = {
  line: number;
  message: string;
};

/**
 * Parse compiler diagnostics into (line, message) pairs.
 *
 * Supports two diagnostic formats:
 * - GCC/clang style: `path/file.c:12: message`
 * - MSVC style:      `path\file.cpp(12) : error C2143: message`
 */
function formatCompilationError(rawError: string, contextFileLinesCount: number): CompilationError[] {
  const errors: CompilationError[] = [];
  const lines = rawError.split('\n');

  for (const line of lines) {
    const gccMatch = line.match(/^(.+?):(\d+):\s*(.+)$/);
    const msvcMatch = !gccMatch ? line.match(/^(.+?)\((\d+)\)\s*:\s*(.+)$/) : null;
    const match = gccMatch ?? msvcMatch;

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

export interface CCompilerOptions {
  /** Source language being compiled. Defaults to `'c'`. */
  language?: SourceLanguage;
  /**
   * Run the system preprocessor (`cpp -P`) before invoking the compiler script.
   * Defaults to `true` for C, `false` for C++ (modern/MSVC-style compilers
   * preprocess themselves, and host `cpp` mangles C++ and Windows headers).
   */
  preprocess?: boolean;
  /**
   * Strip block comments before compiling (workaround for very old
   * compilers like agbcc). Defaults to `true` for C, `false` for C++.
   */
  stripBlockComments?: boolean;
  /** Source file extension. Defaults to `.c` (C) / `.cpp` (C++). */
  sourceExtension?: string;
  /** Object file extension. Defaults to `.o` (C) / `.obj` (C++). */
  objectExtension?: string;
}

/**
 * Utility class for compiling C/C++ code to object files.
 *
 * Uses a shell script template (`compilerScript`) with variable substitution:
 * - `{{cFilePath}}` — absolute path to the source file passed to the compiler
 * - `{{objFilePath}}` — absolute path to the output object file
 * - `{{functionName}}` — the function name being compiled
 * - `{{extraFlags}}` — per-prompt extra compiler flags (may be empty)
 */
export class CCompiler {
  #compilerScript: string;
  #projectRoot: string;
  #language: SourceLanguage;
  #preprocess: boolean;
  #stripBlockComments: boolean;
  #sourceExtension: string;
  #objectExtension: string;

  constructor(compilerScript: string, projectRoot: string, options: CCompilerOptions = {}) {
    this.#compilerScript = compilerScript;
    this.#projectRoot = projectRoot;
    this.#language = options.language ?? 'c';
    this.#preprocess = options.preprocess ?? this.#language === 'c';
    this.#stripBlockComments = options.stripBlockComments ?? this.#language === 'c';
    this.#sourceExtension = options.sourceExtension ?? (this.#language === 'c' ? '.c' : '.cpp');
    this.#objectExtension = options.objectExtension ?? (this.#language === 'c' ? '.o' : '.obj');
  }

  get language(): SourceLanguage {
    return this.#language;
  }

  /**
   * Compiles C/C++ code to an object file.
   * @param functionName - Name of the function being compiled (used for file naming)
   * @param cCode - The source code to compile
   * @param contextContent - Context content (type definitions etc.) to prepend to the source
   * @param extraFlags - Extra compiler flags substituted into `{{extraFlags}}`
   */
  async compile(
    functionName: string,
    cCode: string,
    contextContent: string,
    extraFlags: string = '',
  ): Promise<
    { success: true; objPath: string } | { success: false; errorMessage: string; compilationErrors: CompilationError[] }
  > {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-compile-'));
    const combinedPath = path.join(tmpDir, `${functionName}_combined${this.#sourceExtension}`);
    const strippedPath = path.join(tmpDir, `${functionName}_stripped${this.#sourceExtension}`);
    const preprocessedPath = path.join(tmpDir, `${functionName}_preprocessed${this.#sourceExtension}`);
    const objPath = path.join(tmpDir, `${functionName}${this.#objectExtension}`);
    const scriptPath = path.join(tmpDir, `${functionName}_compile.sh`);

    let succeeded = false;
    let compiledContent = '';
    try {
      // 1. Concatenate context + marker + source
      const combined = contextContent + '\nextern void _MIZUCHI_CONCATENATED_CODE();\n' + cCode;
      await fs.writeFile(combinedPath, combined);

      // 2. Optionally strip block comments that old compilers don't support
      const stripped = this.#stripBlockComments ? combined.replace(/\/\*[\s\S]*?\*\//g, '') : combined;
      if (this.#stripBlockComments) {
        await fs.writeFile(strippedPath, stripped);
      }

      // 3. Optionally preprocess with cpp (system preprocessor — must not inherit
      //    custom env like COMPILER_PATH which would make it find the wrong cc1)
      compiledContent = stripped;
      let compiledPath = this.#stripBlockComments ? strippedPath : combinedPath;
      if (this.#preprocess) {
        const cppOptions = { stdio: 'pipe' as const };
        execSync(`cpp -P "${strippedPath}" "${preprocessedPath}"`, cppOptions);
        compiledPath = preprocessedPath;
        compiledContent = await fs.readFile(preprocessedPath, 'utf-8');
      }

      // 4. Substitute template variables and execute compiler script
      const renderedScript = this.#compilerScript
        .replaceAll('{{cFilePath}}', compiledPath)
        .replaceAll('{{objFilePath}}', objPath)
        .replaceAll('{{functionName}}', functionName)
        .replaceAll('{{extraFlags}}', extraFlags);
      await fs.writeFile(scriptPath, 'set -e\n' + renderedScript);
      execSync(`bash "${scriptPath}"`, { cwd: this.#projectRoot, stdio: 'pipe' });

      succeeded = true;
      return { success: true, objPath };
    } catch (error) {
      if (error instanceof Error) {
        const stderr =
          'stderr' in error && Buffer.isBuffer((error as Record<string, unknown>).stderr)
            ? ((error as Record<string, unknown>).stderr as Buffer).toString().trim()
            : '';
        const stdout =
          'stdout' in error && Buffer.isBuffer((error as Record<string, unknown>).stdout)
            ? ((error as Record<string, unknown>).stdout as Buffer).toString().trim()
            : '';
        const rawError = stderr || stdout || error.message;

        try {
          const mizuchiConcatenatedMarkerLine =
            1 + compiledContent.split('\n').findIndex((line) => line.includes('_MIZUCHI_CONCATENATED_CODE'));

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
      // Clean up intermediates but keep the object file (caller is responsible for it)
      await Promise.allSettled([
        fs.unlink(combinedPath),
        fs.unlink(strippedPath),
        fs.unlink(preprocessedPath),
        fs.unlink(scriptPath),
      ]);
      // On failure, no object is needed — remove the entire temp directory.
      // On success, the caller cleans up via path.dirname(objPath) after consuming it.
      if (!succeeded) {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
