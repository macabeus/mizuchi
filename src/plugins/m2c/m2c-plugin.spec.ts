import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CCompiler } from '~/shared/c-compiler/c-compiler.js';
import { createTestContext, defaultTestPipelineConfig } from '~/shared/test-utils.js';

import { M2cPlugin } from './m2c-plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('M2cPlugin', () => {
  describe('metadata', () => {
    it('has correct plugin id and name', () => {
      const plugin = new M2cPlugin({ enable: true });

      expect(plugin.id).toBe('m2c');
      expect(plugin.name).toBe('m2c');
    });
  });

  describe('.execute', () => {
    it('returns failure when no target object path is provided', async () => {
      const plugin = new M2cPlugin({ enable: true });
      const context = createTestContext({ targetObjectPath: undefined });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('No target object path');
    });

    describe('with real compilation', () => {
      let compiler: CCompiler;
      let contextPath: string;
      let compiledObjPath: string | null = null;

      beforeAll(async () => {
        compiler = new CCompiler();

        // Create a minimal context file
        contextPath = path.join(__dirname, 'test-m2c-plugin-context.h');
        const contextContent = `
typedef unsigned int u32;
typedef signed int s32;
`;
        await fs.writeFile(contextPath, contextContent);
      });

      afterAll(async () => {
        await fs.unlink(contextPath).catch(() => {});
        await fs.unlink(`${contextPath}.m2c`).catch(() => {});
      });

      afterEach(async () => {
        if (compiledObjPath) {
          await fs.unlink(compiledObjPath).catch(() => {});
          compiledObjPath = null;
        }
      });

      it('decompiles a simple function from a real object file', async () => {
        // Compile C code
        const cCode = `
u32 SimpleFunc(u32 a, u32 b) {
    return a + b;
}
`;
        const compileResult = await compiler.compile(
          'SimpleFunc',
          cCode,
          contextPath,
          '-mthumb-interwork -O2 -fhex-asm',
        );

        expect(compileResult.success).toBe(true);
        if (!compileResult.success) {
          return;
        }
        compiledObjPath = compileResult.objPath;

        // Run the m2c plugin
        const plugin = new M2cPlugin({ enable: true });
        const context = createTestContext({
          functionName: 'SimpleFunc',
          targetObjectPath: compiledObjPath,
          config: {
            ...defaultTestPipelineConfig,
            contextPath,
          },
        });

        const { result, context: updatedContext } = await plugin.execute(context);

        expect(result.status).toBe('success');
        expect(result.data?.generatedCode).toBe(`s32 SimpleFunc(s32 arg0, s32 arg1) {
    return arg0 + arg1;
}`);
        expect(updatedContext.generatedCode).toBe(result.data?.generatedCode);
        expect(updatedContext.m2cContext?.generatedCode).toBe(result.data?.generatedCode);
      });

      it('decompiles a function with pointer operations', async () => {
        const cCode = `
u32 ReadPtr(u32 *ptr) {
    return *ptr;
}
`;
        const compileResult = await compiler.compile('ReadPtr', cCode, contextPath, '-mthumb-interwork -O2 -fhex-asm');

        expect(compileResult.success).toBe(true);
        if (!compileResult.success) {
          return;
        }
        compiledObjPath = compileResult.objPath;

        const plugin = new M2cPlugin({ enable: true });
        const context = createTestContext({
          functionName: 'ReadPtr',
          targetObjectPath: compiledObjPath,
          config: {
            ...defaultTestPipelineConfig,
            contextPath,
          },
        });

        const { result } = await plugin.execute(context);

        expect(result.status).toBe('success');
        expect(result.data?.generatedCode).toBe(`s32 ReadPtr(s32 *arg0) {
    return *arg0;
}`);
      });

      it('decompiles a function with multiple parameters', async () => {
        const cCode = `
u32 Sum4(u32 a, u32 b, u32 c, u32 d) {
    return a + b + c + d;
}
`;
        const compileResult = await compiler.compile('Sum4', cCode, contextPath, '-mthumb-interwork -O2 -fhex-asm');

        expect(compileResult.success).toBe(true);
        if (!compileResult.success) {
          return;
        }
        compiledObjPath = compileResult.objPath;

        const plugin = new M2cPlugin({ enable: true });
        const context = createTestContext({
          functionName: 'Sum4',
          targetObjectPath: compiledObjPath,
          config: {
            ...defaultTestPipelineConfig,
            contextPath,
          },
        });

        const { result } = await plugin.execute(context);

        expect(result.status).toBe('success');
        expect(result.data?.generatedCode).toBe(`s32 Sum4(s32 arg0, s32 arg1, s32 arg2, s32 arg3) {
    return arg0 + arg1 + arg2 + arg3;
}`);
      });

      it('returns failure for unsupported target platform', async () => {
        const cCode = `
void TestFunc(void) {}
`;
        const compileResult = await compiler.compile('TestFunc', cCode, contextPath, '-mthumb-interwork -O2 -fhex-asm');

        expect(compileResult.success).toBe(true);
        if (!compileResult.success) {
          return;
        }
        compiledObjPath = compileResult.objPath;

        const plugin = new M2cPlugin({ enable: true });
        const context = createTestContext({
          functionName: 'TestFunc',
          targetObjectPath: compiledObjPath,
          config: {
            ...defaultTestPipelineConfig,
            contextPath,
            target: 'win32', // Not supported by m2c
          },
        });

        const { result } = await plugin.execute(context);

        expect(result.status).toBe('failure');
        expect(result.error).toContain('Unsupported target platform');
      });

      it('returns failure when function does not exist in object file', async () => {
        const cCode = `
void ExistingFunc(void) {
    volatile int x = 1;
}
`;
        const compileResult = await compiler.compile(
          'ExistingFunc',
          cCode,
          contextPath,
          '-mthumb-interwork -O2 -fhex-asm',
        );

        expect(compileResult.success).toBe(true);
        if (!compileResult.success) {
          return;
        }
        compiledObjPath = compileResult.objPath;

        const plugin = new M2cPlugin({ enable: true });
        const context = createTestContext({
          functionName: 'NonExistentFunc',
          targetObjectPath: compiledObjPath,
          config: {
            ...defaultTestPipelineConfig,
            contextPath,
          },
        });

        const { result } = await plugin.execute(context);

        expect(result.status).toBe('failure');
      });
    });
  });

  describe('.getReportSections', () => {
    it('returns code section when generatedCode is present', () => {
      const plugin = new M2cPlugin({ enable: true });
      const result = {
        pluginId: 'm2c',
        pluginName: 'm2c',
        status: 'success' as const,
        durationMs: 100,
        data: { generatedCode: 'int f() { return 0; }' },
      };

      const sections = plugin.getReportSections(result);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('code');
      expect(sections[0].title).toBe('Generated C Code');
    });

    it('returns error section when there is an error', () => {
      const plugin = new M2cPlugin({ enable: true });
      const result = {
        pluginId: 'm2c',
        pluginName: 'm2c',
        status: 'failure' as const,
        durationMs: 100,
        error: 'm2c failed',
      };

      const sections = plugin.getReportSections(result);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('message');
      expect(sections[0].title).toBe('Error');
    });
  });
});
