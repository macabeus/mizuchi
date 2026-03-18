/**
 * Integrator Helpers
 *
 * Utility functions provided to the user's integratorModule script.
 * These handle common patterns across decomp projects (INCLUDE_ASM replacement,
 * #pragma GLOBAL_ASM replacement, etc.).
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface IntegratorHelpers {
  /**
   * Find which source file contains the INCLUDE_ASM or #pragma GLOBAL_ASM stub
   * for the given function name. Searches all `.c` files under the worktree's `src/` directory.
   * Returns the absolute path to the file, or throws if not found.
   */
  findSourceFile(functionName: string): string;

  /**
   * Replace an `INCLUDE_ASM("...", functionName);` call with the given C code.
   * Handles both single-line and multi-line INCLUDE_ASM patterns.
   */
  replaceIncludeAsm(filePath: string, functionName: string, code: string): void;

  /**
   * Replace a `#pragma GLOBAL_ASM("...functionName...")` with C code.
   */
  replacePragmaGlobalAsm(filePath: string, functionName: string, code: string): void;

  /**
   * Strip forward/extern declarations from `code` that already exist in `filePath`
   * (matched by function name). This prevents duplicate declarations when multiple
   * decompiled functions reference the same external symbol.
   *
   * Returns the cleaned code.
   */
  stripDuplicateDeclarations(filePath: string, code: string): string;

  /**
   * Run a shell command in the worktree directory.
   * Returns stdout as a string. Throws on non-zero exit.
   */
  exec(command: string, options?: { timeout?: number }): string;

  /**
   * Log a message to the plugin output (captured in the run report).
   */
  log(message: string): void;
}

export function createIntegratorHelpers(worktreePath: string): {
  helpers: IntegratorHelpers;
  getLogs(): string[];
} {
  const logs: string[] = [];

  const helpers: IntegratorHelpers = {
    findSourceFile(functionName: string): string {
      const srcDir = path.join(worktreePath, 'src');
      if (!fs.existsSync(srcDir)) {
        throw new Error(`src/ directory not found in worktree at ${worktreePath}`);
      }

      const cFiles = findCFilesRecursive(srcDir);

      for (const filePath of cFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for INCLUDE_ASM("...", functionName)
        const includeAsmPattern = new RegExp(`INCLUDE_ASM\\s*\\([^,]*,\\s*${escapeRegExp(functionName)}\\s*\\)\\s*;`);
        if (includeAsmPattern.test(content)) {
          return filePath;
        }

        // Check for #pragma GLOBAL_ASM("...functionName...")
        const pragmaPattern = new RegExp(
          `#pragma\\s+GLOBAL_ASM\\s*\\(\\s*"[^"]*${escapeRegExp(functionName)}[^"]*"\\s*\\)`,
        );
        if (pragmaPattern.test(content)) {
          return filePath;
        }
      }

      throw new Error(`Could not find source file containing stub for function "${functionName}" in ${srcDir}`);
    },

    replaceIncludeAsm(filePath: string, functionName: string, code: string): void {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Match INCLUDE_ASM("folder", functionName); with flexible whitespace
      const pattern = new RegExp(`INCLUDE_ASM\\s*\\([^,]*,\\s*${escapeRegExp(functionName)}\\s*\\)\\s*;[ \\t]*\\n?`);

      if (!pattern.test(content)) {
        throw new Error(`Could not find INCLUDE_ASM stub for "${functionName}" in ${filePath}`);
      }

      const updated = content.replace(pattern, code.trimEnd() + '\n');
      fs.writeFileSync(filePath, updated);
      logs.push(`Replaced INCLUDE_ASM stub for ${functionName} in ${path.relative(worktreePath, filePath)}`);
    },

    replacePragmaGlobalAsm(filePath: string, functionName: string, code: string): void {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Match #pragma GLOBAL_ASM("...functionName...")
      const pattern = new RegExp(
        `#pragma\\s+GLOBAL_ASM\\s*\\(\\s*"[^"]*${escapeRegExp(functionName)}[^"]*"\\s*\\)[ \\t]*\\n?`,
      );

      if (!pattern.test(content)) {
        throw new Error(`Could not find #pragma GLOBAL_ASM for "${functionName}" in ${filePath}`);
      }

      const updated = content.replace(pattern, code.trimEnd() + '\n');
      fs.writeFileSync(filePath, updated);
      logs.push(`Replaced #pragma GLOBAL_ASM for ${functionName} in ${path.relative(worktreePath, filePath)}`);
    },

    stripDuplicateDeclarations(filePath: string, code: string): string {
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // Extract function names that are already declared or defined in the target file.
      // Requires at least a return-type token before the name to avoid matching keywords
      // (if, while, sizeof, etc.) and macro invocations.
      const declaredNames = new Set<string>();
      const declPattern = /(?:^|[\n;{}])\s*(?:extern\s+)?[\w\s*]+?\b(\w+)\s*\(/gm;
      let m;
      while ((m = declPattern.exec(fileContent)) !== null) {
        declaredNames.add(m[1]);
      }

      // Remove forward/extern declaration lines from `code` for functions
      // already present in the file. Only strip lines BEFORE the first
      // function definition (opening `{`), to avoid removing code inside
      // function bodies.
      const lines = code.split('\n');
      let seenOpenBrace = false;
      const filtered = lines.filter((line) => {
        const trimmed = line.trim();

        if (trimmed.includes('{')) {
          seenOpenBrace = true;
        }

        // Only strip declarations that appear before any function body
        if (!seenOpenBrace) {
          // Match: optional "extern", return type, name, parens, semicolon
          const declMatch = /^(?:extern\s+)?[\w\s*]+?\b(\w+)\s*\([^)]*\)\s*;\s*$/.exec(trimmed);
          if (declMatch) {
            const funcName = declMatch[1];
            if (declaredNames.has(funcName)) {
              logs.push(`Stripped duplicate declaration for ${funcName}`);
              return false;
            }
          }
        }

        return true;
      });

      // Clean up leading blank lines that result from stripping
      const result = filtered.join('\n').replace(/^\n+/, '');
      return result;
    },

    exec(command: string, options?: { timeout?: number }): string {
      const result = execSync(command, {
        cwd: worktreePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options?.timeout ?? 120_000,
      });
      return result.toString();
    },

    log(message: string): void {
      logs.push(message);
    },
  };

  return { helpers, getLogs: () => logs };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findCFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findCFilesRecursive(fullPath));
    } else if (entry.name.endsWith('.c')) {
      results.push(fullPath);
    }
  }
  return results;
}
