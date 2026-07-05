import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getArmCompilerScript, getMipsCompilerScript } from './__fixtures__/index.js';
import { CCompiler } from './c-compiler.js';

describe('CCompiler', () => {
  const compiledObjects: string[] = [];
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-test-project-'));
  });

  afterEach(async () => {
    for (const objPath of compiledObjects) {
      await fs.unlink(objPath).catch(() => {});
    }
    compiledObjects.length = 0;
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  describe('ARM (agbcc)', () => {
    it('compiles a simple function', async () => {
      const compiler = new CCompiler(getArmCompilerScript(), projectRoot);
      const code = `void TestFunc(void) { volatile int x = 1; }`;
      const result = await compiler.compile('TestFunc', code, '');

      expect(result.success).toBe(true);
      if (result.success) {
        compiledObjects.push(result.objPath);
      }
    });

    it('returns compilation errors for invalid code', async () => {
      const compiler = new CCompiler(getArmCompilerScript(), projectRoot);
      const code = `void BadFunc(void) { undefined_type x; }`;
      const result = await compiler.compile('BadFunc', code, '');

      expect(result.success).toBe(false);
    });
  });

  describe('MIPS (KMC GCC)', () => {
    it('compiles a simple function', async () => {
      const compiler = new CCompiler(getMipsCompilerScript(), projectRoot);
      const code = `
int add(int a, int b) {
    return a + b;
}
`;
      const result = await compiler.compile('add', code, '');

      expect(result.success).toBe(true);
      if (result.success) {
        compiledObjects.push(result.objPath);
        const stat = await fs.stat(result.objPath);
        expect(stat.size).toBeGreaterThan(0);
      }
    });

    it('compiles a function with local variables', async () => {
      const compiler = new CCompiler(getMipsCompilerScript(), projectRoot);
      const code = `
int sum_array(int *arr, int n) {
    int total = 0;
    int i;
    for (i = 0; i < n; i++) {
        total += arr[i];
    }
    return total;
}
`;
      const result = await compiler.compile('sum_array', code, '');
      if (result.success) {
        compiledObjects.push(result.objPath);
      }

      expect(result.success).toBe(true);
    });

    it('returns compilation errors for invalid code', async () => {
      const compiler = new CCompiler(getMipsCompilerScript(), projectRoot);
      const code = `void BadFunc(void) { undefined_type x; }`;
      const result = await compiler.compile('BadFunc', code, '');

      expect(result.success).toBe(false);
    });
  });

  describe('compilerScript scratch isolation (concurrency)', () => {
    // Regression test for the "Symbol not found" race.
    //
    // The dominant concurrency source is the background decomp-permuter, which
    // compiles many candidates as PARALLEL processes (Python multiprocessing).
    // Each worker cd's into the shared project root and runs the compilerScript,
    // and — crucially — the permuter names every candidate .o with
    // `tempfile.NamedTemporaryFile(suffix=".o")`: a unique filename but in the
    // SHARED system temp dir, all for the SAME function. So a compilerScript
    // whose scratch path is a bare "asm.s" (shared cwd) OR dirname({{objFilePath}})
    // + functionName (shared temp dir) is clobbered mid-compile, and the
    // assembler emits an object holding the WRONG function — objdiff then reports
    // "Symbol not found".
    //
    // The safe pattern (used by the shipped configs) scopes the scratch file to
    // the FULL, always-unique {{objFilePath}}. This test reproduces the permuter's
    // layout with real parallel processes and asserts no cross-contamination.
    // (CCompiler's own execSync serializes, so the race is strictly cross-process
    // — hence real spawn() here rather than Promise.all over compile().)
    const runScript = (script: string, cwd: string): Promise<number> =>
      new Promise((resolve) => {
        const child = spawn('bash', ['-c', script], { cwd, stdio: 'ignore' });
        child.on('close', (code) => resolve(code ?? -1));
        child.on('error', () => resolve(-1));
      });

    it('scoping scratch to the full {{objFilePath}} survives parallel same-function compiles in a shared temp dir', async () => {
      const count = 16;
      const marker = (i: number) => `MARKERcand${String(i).padStart(2, '0')}END`;
      // One shared dir holds every candidate .o (mimics NamedTemporaryFile's use
      // of the system temp dir); filenames are unique, the directory is not.
      const objDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-permuter-'));
      const objFile = (i: number) => path.join(objDir, `permuter_cand_${i}.o`);

      try {
        // Same shape as the shipped configs: ASM_FILE="{{objFilePath}}.s".
        // The `sleep` widens the write→consume window so a shared scratch name
        // would reliably collide (real cross-compilers take tens of ms anyway).
        const scriptFor = (i: number) =>
          [
            `ASM_FILE="${objFile(i)}.s"`,
            `printf '%s' '${marker(i)}' > "$ASM_FILE"`,
            'sleep 0.1',
            `sed '/_DROP_/d' "$ASM_FILE" > "$ASM_FILE.stripped" && mv "$ASM_FILE.stripped" "$ASM_FILE"`,
            `cp "$ASM_FILE" "${objFile(i)}"`,
          ].join('\n');

        // Real parallel processes, all with cwd = the shared project root.
        const codes = await Promise.all(Array.from({ length: count }, (_, i) => runScript(scriptFor(i), projectRoot)));

        for (let i = 0; i < count; i++) {
          expect(codes[i]).toBe(0);
          const obj = await fs.readFile(objFile(i), 'utf-8');
          // Each object must carry its OWN marker and none of its siblings'.
          expect(obj).toContain(marker(i));
          for (let j = 0; j < count; j++) {
            if (j !== i) {
              expect(obj).not.toContain(marker(j));
            }
          }
        }
        // Nothing must leak into the shared project root.
        const leaked = (await fs.readdir(projectRoot)).filter((f) => f.endsWith('.s'));
        expect(leaked).toEqual([]);
      } finally {
        await fs.rm(objDir, { recursive: true, force: true });
      }
    });
  });
});
