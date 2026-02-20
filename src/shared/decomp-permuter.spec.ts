import { execSync } from 'child_process';
import fs from 'fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getArmCompilerScript, getMipsCompilerScript } from './c-compiler/__fixtures__/index.js';
import { CCompiler } from './c-compiler/c-compiler.js';
import { DecompPermuter, getToolchainForTarget } from './decomp-permuter.js';

/**
 * Finding a good seed for permuter tests
 *
 * Tests that need the permuter to find a score improvement use `--seed <N>`
 * for determinism. Without a fixed seed, the permuter explores mutations
 * randomly and may or may not find improvements within the test timeout,
 * leading to flaky tests.
 *
 * To find a working seed for a given test function pair:
 *
 * 1. Write a temporary test that loops over candidate seeds:
 *
 *    for (const seed of [0, 10, 20, ..., 200]) {
 *      it(`seed ${seed}`, async () => {
 *        const result = await permuter.run({
 *          cCode: NON_MATCHING_C_CODE,
 *          targetObjectPath: targetObjPath,
 *          functionName: '...',
 *          compilerScript,
 *          target: '...',
 *          compilerType: '...',
 *          maxIterations: 3,    // base-score + 2 improvements
 *          timeoutMs: 10000,
 *          flags: ['--seed', String(seed)],
 *        });
 *        console.log(`seed=${seed}: base=${result.baseScore} best=${result.bestScore} elapsed=...`);
 *      }, 15000);
 *    }
 *
 * 2. Pick a seed where best < base and elapsed is low (~1s).
 *    A good seed finds an improvement within the first ~10 iterations.
 *    Currently seed 98 works well for the SimpleAdd (a-b vs a+b) ARM case.
 *
 * 3. Note: without --seed, the permuter explores more of the mutation space
 *    per iteration (truly random). With --seed, it locks the RNG and replays
 *    the same mutation sequence, so it either finds an improvement quickly
 *    or never does. Always verify the chosen seed with maxIterations: 2.
 */

/**
 * Add .NON_MATCHING alias symbols to an object file (in-place).
 *
 * N64 decomp projects (e.g. Animal Forest) use asm-processor to emit
 * NON_MATCHING alias symbols at the same address as each function.
 * This reproduces that pattern for testing.
 */
function addNonMatchingAliases(objPath: string, functionNames: string[], toolchainPrefix: string): void {
  // Get addresses of each function via nm
  const nmOutput = execSync(`${toolchainPrefix}nm --numeric-sort "${objPath}" 2>/dev/null`).toString();
  const addSymbolArgs = functionNames
    .map((name) => {
      const match = nmOutput.match(new RegExp(`^([0-9a-f]+) T ${name}$`, 'm'));
      if (!match) {
        return null;
      }
      return `--add-symbol "${name}.NON_MATCHING=.text:0x${match[1]},global"`;
    })
    .filter(Boolean)
    .join(' ');

  if (addSymbolArgs) {
    execSync(`${toolchainPrefix}objcopy ${addSymbolArgs} "${objPath}"`, { stdio: 'pipe' });
  }
}

describe('DecompPermuter', () => {
  describe('.run (GCC/GBA)', () => {
    let permuter: DecompPermuter;
    let compiler: CCompiler;
    /** Path to a compiled target .o file (compiled from MATCHING_C_CODE) */
    let targetObjPath: string;

    // Simple ARM function — code that matches its own compiled assembly
    const MATCHING_C_CODE = 'int SimpleAdd(int a, int b) { return a + b; }';
    // Code that compiles but produces different assembly from MATCHING_C_CODE's target
    const NON_MATCHING_C_CODE = 'int SimpleAdd(int a, int b) { return a - b; }';

    const compilerScript = getArmCompilerScript();

    beforeAll(async () => {
      permuter = new DecompPermuter();
      compiler = new CCompiler(compilerScript);

      // Compile the matching code to create a target .o
      const compileResult = await compiler.compile('SimpleAdd', MATCHING_C_CODE, '');
      expect(compileResult.success).toBe(true);
      if (!compileResult.success) {
        throw new Error('Failed to compile target code for tests');
      }
      targetObjPath = compileResult.objPath;
    });

    afterAll(async () => {
      if (targetObjPath) {
        await fs.unlink(targetObjPath).catch(() => {});
      }
    });

    it('reports base score 0 when code already matches', async () => {
      const result = await permuter.run({
        cCode: MATCHING_C_CODE,
        targetObjectPath: targetObjPath,
        functionName: 'SimpleAdd',
        compilerScript,
        target: 'gba',
        compilerType: 'gcc',
        // maxIterations: 1 → kills right after the base-score entry is parsed,
        // preventing a long wait for improvement entries that never come at score 0.
        maxIterations: 1,
        timeoutMs: 10000,
      });

      expect(result.error).toBeUndefined();
      expect(result.baseScore).toBe(0);
      expect(result.bestScore).toBe(0);
    }, 10000);

    it('reports a non-zero base score for non-matching code', async () => {
      const result = await permuter.run({
        cCode: NON_MATCHING_C_CODE,
        targetObjectPath: targetObjPath,
        functionName: 'SimpleAdd',
        compilerScript,
        target: 'gba',
        compilerType: 'gcc',
        // Only need the base-score entry to verify baseScore > 0.
        maxIterations: 1,
        timeoutMs: 10000,
      });

      expect(result.error).toBeUndefined();
      expect(result.baseScore).toBeGreaterThan(0);
      // iterationsRun tracks actual permuter iterations (from "iteration N" progress lines).
      // With maxIterations: 1, the process is killed after the base-score event, but a
      // few iterations may have run before the kill takes effect.
      expect(result.iterationsRun).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('respects maxIterations limit', async () => {
      const maxIterations = 2;
      const start = Date.now();
      const result = await permuter.run({
        cCode: NON_MATCHING_C_CODE,
        targetObjectPath: targetObjPath,
        functionName: 'SimpleAdd',
        compilerScript,
        target: 'gba',
        compilerType: 'gcc',
        maxIterations,
        timeoutMs: 30000,
        flags: ['--seed', '98'],
      });
      const elapsed = Date.now() - start;

      expect(result.error).toBeUndefined();
      expect(elapsed).toBeLessThan(10000);
    }, 15000);

    it('respects timeoutMs limit', async () => {
      const result = await permuter.run({
        cCode: NON_MATCHING_C_CODE,
        targetObjectPath: targetObjPath,
        functionName: 'SimpleAdd',
        compilerScript,
        target: 'gba',
        compilerType: 'gcc',
        maxIterations: 100000,
        timeoutMs: 1500,
      });

      // Should terminate without error (timeout just kills the process)
      expect(result.error).toBeUndefined();
      expect(result.baseScore).toBeGreaterThan(0);
    }, 10000);

    it('passes context content to compile.sh', async () => {
      // Context content is concatenated before the C code during compilation.
      // Note: base.c must be self-contained for the permuter's own preprocessing
      // (pycparser), so we use standard C types in the code itself.
      const contextContent = '/* context marker for test */';

      const result = await permuter.run({
        cCode: MATCHING_C_CODE,
        targetObjectPath: targetObjPath,
        functionName: 'SimpleAdd',
        compilerScript,
        target: 'gba',
        compilerType: 'gcc',
        contextContent,
        maxIterations: 1,
        timeoutMs: 10000,
      });

      // Should compile successfully with context prepended
      expect(result.error).toBeUndefined();
      expect(result.baseScore).toBe(0);
    }, 10000);

    it('compiles successfully when context has typedefs (no double-include)', async () => {
      // Reproduces: compile.sh prepends #include "context.h", but base.c
      // already has it from setupWorkingDir → double include → redefinition errors.
      const contextContent = 'typedef unsigned char uint8_t;\ntypedef unsigned short uint16_t;\n';

      const result = await permuter.run({
        cCode: MATCHING_C_CODE,
        targetObjectPath: targetObjPath,
        functionName: 'SimpleAdd',
        compilerScript,
        target: 'gba',
        compilerType: 'gcc',
        contextContent,
        maxIterations: 1,
        timeoutMs: 10000,
      });

      expect(result.stderr).not.toContain('redefinition');
      expect(result.error).toBeUndefined();
      expect(result.baseScore).toBe(0);
    }, 10000);

    it('stops promptly when abort signal fires', async () => {
      const abortController = new AbortController();

      // Abort after 500ms — enough for the permuter to start
      setTimeout(() => abortController.abort(), 500);

      const start = Date.now();
      const result = await permuter.run({
        cCode: NON_MATCHING_C_CODE,
        targetObjectPath: targetObjPath,
        functionName: 'SimpleAdd',
        compilerScript,
        target: 'gba',
        compilerType: 'gcc',
        maxIterations: 100000,
        timeoutMs: 30000,
        signal: abortController.signal,
      });

      const elapsed = Date.now() - start;

      // Should terminate shortly after the 500ms abort signal
      expect(elapsed).toBeLessThan(5000);
      expect(result.error).toBeUndefined();
    }, 10000);

    it('scores correctly when target.o has multiple functions', async () => {
      // Compile a multi-function source as target.o — SimpleAdd is surrounded
      // by other functions whose assembly would inflate the score without the
      // objdump wrapper filtering to just the target function.
      const multiFunctionCode = [
        'int HelperFunc(int x) { return x * 3 + 7; }',
        'int SimpleAdd(int a, int b) { return a + b; }',
        'int AnotherFunc(int a, int b, int c) { return a * b - c; }',
      ].join('\n');

      const multiTargetResult = await compiler.compile('SimpleAdd', multiFunctionCode, '');
      expect(multiTargetResult.success).toBe(true);
      if (!multiTargetResult.success) {
        throw new Error('Failed to compile multi-function target');
      }

      try {
        const result = await permuter.run({
          cCode: MATCHING_C_CODE,
          targetObjectPath: multiTargetResult.objPath,
          functionName: 'SimpleAdd',
          compilerScript,
          target: 'gba',
          compilerType: 'gcc',
          maxIterations: 1,
          timeoutMs: 10000,
        });

        expect(result.error).toBeUndefined();
        // Without the objdump wrapper, baseScore would be huge because the
        // scorer compares all assembly (3 functions vs 1). With the wrapper,
        // only SimpleAdd is compared → perfect match.
        expect(result.baseScore).toBe(0);
      } finally {
        await fs.unlink(multiTargetResult.objPath).catch(() => {});
      }
    }, 10000);

    it('returns error for invalid target object path', async () => {
      const result = await permuter.run({
        cCode: MATCHING_C_CODE,
        targetObjectPath: '/nonexistent/target.o',
        functionName: 'SimpleAdd',
        compilerScript,
        target: 'gba',
        compilerType: 'gcc',
        maxIterations: 1,
        timeoutMs: 10000,
      });

      expect(result.error).toBeDefined();
      expect(result.baseScore).toBe(-1);
    }, 15000);
  });

  describe('.run (MIPS/N64)', () => {
    let permuter: DecompPermuter;
    let compiler: CCompiler;
    let targetObjPath: string;

    const MATCHING_C_CODE = 'int simple_add(int a, int b) { return a + b; }';
    const NON_MATCHING_C_CODE = 'int simple_add(int a, int b) { return a - b; }';

    const compilerScript = getMipsCompilerScript();

    beforeAll(async () => {
      permuter = new DecompPermuter();
      compiler = new CCompiler(compilerScript);

      const compileResult = await compiler.compile('simple_add', MATCHING_C_CODE, '');
      expect(compileResult.success).toBe(true);
      if (!compileResult.success) {
        throw new Error('Failed to compile MIPS target code for tests');
      }
      targetObjPath = compileResult.objPath;
    });

    afterAll(async () => {
      if (targetObjPath) {
        await fs.unlink(targetObjPath).catch(() => {});
      }
    });

    it('reports base score 0 when MIPS code already matches', async () => {
      const result = await permuter.run({
        cCode: MATCHING_C_CODE,
        targetObjectPath: targetObjPath,
        functionName: 'simple_add',
        compilerScript,
        target: 'n64',
        compilerType: 'ido',
        maxIterations: 1,
        timeoutMs: 10000,
      });

      expect(result.error).toBeUndefined();
      expect(result.baseScore).toBe(0);
    }, 10000);

    it('reports non-zero base score for non-matching MIPS code', async () => {
      const result = await permuter.run({
        cCode: NON_MATCHING_C_CODE,
        targetObjectPath: targetObjPath,
        functionName: 'simple_add',
        compilerScript,
        target: 'n64',
        compilerType: 'ido',
        maxIterations: 1,
        timeoutMs: 10000,
      });

      expect(result.error).toBeUndefined();
      expect(result.baseScore).toBeGreaterThan(0);
    }, 10000);

    it('scores correctly when MIPS target.o has multiple functions', async () => {
      const multiFunctionCode = [
        'int helper_func(int x) { return x * 3 + 7; }',
        'int simple_add(int a, int b) { return a + b; }',
        'int another_func(int a, int b, int c) { return a * b - c; }',
      ].join('\n');

      const multiTargetResult = await compiler.compile('simple_add', multiFunctionCode, '');
      expect(multiTargetResult.success).toBe(true);
      if (!multiTargetResult.success) {
        throw new Error('Failed to compile multi-function MIPS target');
      }

      try {
        const result = await permuter.run({
          cCode: MATCHING_C_CODE,
          targetObjectPath: multiTargetResult.objPath,
          functionName: 'simple_add',
          compilerScript,
          target: 'n64',
          compilerType: 'ido',
          maxIterations: 1,
          timeoutMs: 10000,
        });

        expect(result.error).toBeUndefined();
        expect(result.baseScore).toBe(0);
      } finally {
        await fs.unlink(multiTargetResult.objPath).catch(() => {});
      }
    }, 10000);

    it('handles target.o with .NON_MATCHING alias symbols at same address', async () => {
      // N64 decomp projects use asm-processor which emits .NON_MATCHING aliases
      // at the same address as each function. nm output looks like:
      //   00000000 T helper_func
      //   00000000 T helper_func.NON_MATCHING
      //   00000010 T simple_add
      //   00000010 T simple_add.NON_MATCHING
      //
      // The objdump wrapper must skip these same-address aliases when computing
      // --stop-address, otherwise it passes start==stop which objdump rejects.
      const multiFunctionCode = [
        'int helper_func(int x) { return x * 3 + 7; }',
        'int simple_add(int a, int b) { return a + b; }',
        'int another_func(int a, int b, int c) { return a * b - c; }',
      ].join('\n');

      const multiTargetResult = await compiler.compile('simple_add', multiFunctionCode, '');
      expect(multiTargetResult.success).toBe(true);
      if (!multiTargetResult.success) {
        throw new Error('Failed to compile multi-function MIPS target');
      }

      // Add .NON_MATCHING aliases at the same addresses (mimics asm-processor)
      addNonMatchingAliases(
        multiTargetResult.objPath,
        ['helper_func', 'simple_add', 'another_func'],
        'mips-linux-gnu-',
      );

      try {
        const result = await permuter.run({
          cCode: MATCHING_C_CODE,
          targetObjectPath: multiTargetResult.objPath,
          functionName: 'simple_add',
          compilerScript,
          target: 'n64',
          compilerType: 'ido',
          maxIterations: 1,
          timeoutMs: 10000,
        });

        expect(result.error).toBeUndefined();
        expect(result.baseScore).toBe(0);
      } finally {
        await fs.unlink(multiTargetResult.objPath).catch(() => {});
      }
    }, 10000);
  });

  describe('getToolchainForTarget', () => {
    it('returns ARM toolchain for GBA', () => {
      const toolchain = getToolchainForTarget('gba');
      expect(toolchain.objdumpCandidates).toEqual(['arm-none-eabi-objdump']);
      expect(toolchain.nmCandidates).toEqual(['arm-none-eabi-nm']);
      expect(toolchain.objdumpFlags).toEqual(['-drz']);
      expect(toolchain.defaultCompilerType).toBe('gcc');
    });

    it('returns MIPS toolchain for N64', () => {
      const toolchain = getToolchainForTarget('n64');
      expect(toolchain.objdumpCandidates).toEqual([
        'mips-linux-gnu-objdump',
        'mips64-linux-gnu-objdump',
        'mips64-elf-objdump',
      ]);
      expect(toolchain.nmCandidates).toEqual(['mips-linux-gnu-nm', 'mips64-linux-gnu-nm', 'mips64-elf-nm']);
      expect(toolchain.objdumpFlags).toEqual(['-drz', '-m', 'mips:4300']);
      expect(toolchain.defaultCompilerType).toBe('ido');
    });

    it('returns PowerPC toolchain for GameCube', () => {
      const toolchain = getToolchainForTarget('gc');
      expect(toolchain.objdumpCandidates).toEqual(['powerpc-eabi-objdump']);
      expect(toolchain.objdumpFlags).toEqual(['-dr', '-EB', '-mpowerpc', '-M', 'broadway']);
      expect(toolchain.defaultCompilerType).toBe('mwcc');
    });

    it('returns system toolchain for unknown targets', () => {
      const toolchain = getToolchainForTarget('switch');
      expect(toolchain.objdumpCandidates).toEqual(['objdump']);
      expect(toolchain.nmCandidates).toEqual(['nm']);
      expect(toolchain.defaultCompilerType).toBe('gcc');
    });
  });
});
