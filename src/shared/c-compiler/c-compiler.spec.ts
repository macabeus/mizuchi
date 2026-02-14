import fs from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { getArmCompilerScript, getMipsCompilerScript } from './__fixtures__/index.js';
import { CCompiler } from './c-compiler.js';

describe('CCompiler', () => {
  const compiledObjects: string[] = [];

  afterEach(async () => {
    for (const objPath of compiledObjects) {
      await fs.unlink(objPath).catch(() => {});
    }
    compiledObjects.length = 0;
  });

  describe('ARM (agbcc)', () => {
    const compiler = new CCompiler(getArmCompilerScript());

    it('compiles a simple function', async () => {
      const code = `void TestFunc(void) { volatile int x = 1; }`;
      const result = await compiler.compile('TestFunc', code, '');

      expect(result.success).toBe(true);
      if (result.success) {
        compiledObjects.push(result.objPath);
      }
    });

    it('returns compilation errors for invalid code', async () => {
      const code = `void BadFunc(void) { undefined_type x; }`;
      const result = await compiler.compile('BadFunc', code, '');

      expect(result.success).toBe(false);
    });
  });

  describe('MIPS (KMC GCC)', () => {
    const compiler = new CCompiler(getMipsCompilerScript());

    it('compiles a simple function', async () => {
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
      const code = `void BadFunc(void) { undefined_type x; }`;
      const result = await compiler.compile('BadFunc', code, '');

      expect(result.success).toBe(false);
    });
  });
});
