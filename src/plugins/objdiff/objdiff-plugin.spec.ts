import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ARM_DIFF_SETTINGS, getArmCompilerScript } from '~/shared/c-compiler/__fixtures__/index.js';
import { CCompiler } from '~/shared/c-compiler/c-compiler.js';
import { createTestContext, defaultTestPipelineConfig } from '~/shared/test-utils.js';
import type { PipelineContext } from '~/shared/types.js';

import { ObjdiffPlugin } from './objdiff-plugin.js';

describe('ObjdiffPlugin', () => {
  let tempDir: string;
  let plugin: ObjdiffPlugin;

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'objdiff-plugin-test-'));
    plugin = new ObjdiffPlugin({ diffSettings: ARM_DIFF_SETTINGS });
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  const createContext = (overrides: Partial<PipelineContext> = {}): PipelineContext =>
    createTestContext({
      functionName: 'TestFunc',
      config: {
        ...defaultTestPipelineConfig,
        outputDir: tempDir,
      },
      ...overrides,
    });

  describe('.execute error handling', () => {
    it('fails when no compiled object path in context', async () => {
      const context = createContext({ compiledObjectPath: undefined });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toBe('No compiled object file to compare');
      expect(result.pluginId).toBe('objdiff');
      expect(result.pluginName).toBe('Objdiff');
    });

    it('fails when no target object path in context', async () => {
      const context = createContext({
        compiledObjectPath: '/some/path.o',
        targetObjectPath: undefined,
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toBe('No target object file specified');
    });

    it('fails when no function name in context', async () => {
      const context = createContext({
        compiledObjectPath: '/some/path.o',
        targetObjectPath: '/target/path.o',
        functionName: undefined,
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toBe('No function name specified');
    });

    it('fails when compiled object file does not exist', async () => {
      const context = createContext({
        compiledObjectPath: '/nonexistent/file.o',
        targetObjectPath: '/also/nonexistent.o',
        functionName: 'TestFunc',
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toBeDefined();
    });

    it('records duration in result', async () => {
      const context = createContext({ compiledObjectPath: undefined });

      const { result } = await plugin.execute(context);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('integration tests with actual compilation', async () => {
    const compiler = new CCompiler(getArmCompilerScript());
    // Empty context path since these tests don't use custom types
    const emptyContextPath = '';

    it('succeeds when compiled code matches target exactly', async () => {
      let compiledObjPath: string | undefined;
      let targetObjPath: string | undefined;
      let finalTargetPath: string | undefined;

      try {
        const cCode = `
  void TestMatchFunc(void) {
      volatile int x = 1;
      x = x + 1;
  }
  `;
        // Compile same code twice - should match
        const compiledResult = await compiler.compile('TestMatchFunc', cCode, emptyContextPath);
        const targetResult = await compiler.compile('TestMatchFunc_target', cCode, emptyContextPath);

        if (!compiledResult.success || !targetResult.success) {
          throw new Error('Compilation failed');
        }

        compiledObjPath = compiledResult.objPath;
        targetObjPath = targetResult.objPath;

        // Copy target file
        finalTargetPath = path.join(tempDir, 'target.o');
        await fs.copyFile(targetResult.objPath, finalTargetPath);

        const integrationPlugin = new ObjdiffPlugin({ diffSettings: ARM_DIFF_SETTINGS });
        const context = createContext({
          compiledObjectPath: compiledResult.objPath,
          targetObjectPath: finalTargetPath,
          functionName: 'TestMatchFunc',
        });

        const { result } = await integrationPlugin.execute(context);

        expect(result.status).toBe('success');
        expect(result.output).toContain('Perfect match');
        expect(result.data?.matchingCount).toBeGreaterThan(0);
        expect(result.data?.differenceCount).toBe(0);
      } finally {
        if (compiledObjPath) {
          fs.unlink(compiledObjPath).catch(() => {});
        }
        if (targetObjPath) {
          fs.unlink(targetObjPath).catch(() => {});
        }
        if (finalTargetPath) {
          fs.unlink(finalTargetPath).catch(() => {});
        }
      }
    });

    it('fails when compiled code differs from target', async () => {
      let compiledObjPath: string | undefined;
      let targetObjPath: string | undefined;
      let finalTargetPath: string | undefined;

      try {
        const currentCode = `
  void TestDiffFunc(void) {
      volatile int x = 1;
  }
  `;
        const targetCode = `
  void TestDiffFunc(void) {
      volatile int x = 2;
      x = x + 1;
  }
  `;
        const compiledResult = await compiler.compile('TestDiffFunc', currentCode, emptyContextPath);
        const targetResult = await compiler.compile('TestDiffFunc_target', targetCode, emptyContextPath);

        if (!compiledResult.success || !targetResult.success) {
          throw new Error('Compilation failed');
        }

        compiledObjPath = compiledResult.objPath;
        targetObjPath = targetResult.objPath;

        finalTargetPath = path.join(tempDir, 'target_diff.o');
        await fs.copyFile(targetResult.objPath, finalTargetPath);

        const integrationPlugin = new ObjdiffPlugin({ diffSettings: ARM_DIFF_SETTINGS });
        const context = createContext({
          compiledObjectPath: compiledResult.objPath,
          targetObjectPath: finalTargetPath,
          functionName: 'TestDiffFunc',
        });

        const { result } = await integrationPlugin.execute(context);

        expect(result.status).toBe('failure');
        expect(result.error).toContain('Assembly mismatch');
        expect(result.data?.differenceCount).toBeGreaterThan(0);
        expect(result.output).toContain('Current Assembly');
        expect(result.output).toContain('Target Assembly');
        expect(result.output).toContain('Differences');
      } finally {
        if (compiledObjPath) {
          fs.unlink(compiledObjPath).catch(() => {});
        }
        if (targetObjPath) {
          fs.unlink(targetObjPath).catch(() => {});
        }
        if (finalTargetPath) {
          fs.unlink(finalTargetPath).catch(() => {});
        }
      }
    });

    it('fails when function symbol is not found', async () => {
      let compiledObjPath: string | undefined;
      let targetObjPath: string | undefined;
      let finalTargetPath: string | undefined;

      try {
        const cCode = `
  void ActualFunc(void) {
      volatile int x = 1;
  }
  `;
        const compiledResult = await compiler.compile('ActualFunc', cCode, emptyContextPath);
        const targetResult = await compiler.compile('ActualFunc_copy', cCode, emptyContextPath);

        if (!compiledResult.success || !targetResult.success) {
          throw new Error('Compilation failed');
        }

        compiledObjPath = compiledResult.objPath;
        targetObjPath = targetResult.objPath;

        finalTargetPath = path.join(tempDir, 'target_symbol.o');
        await fs.copyFile(targetResult.objPath, finalTargetPath);

        const integrationPlugin = new ObjdiffPlugin({ diffSettings: ARM_DIFF_SETTINGS });
        const context = createContext({
          compiledObjectPath: compiledResult.objPath,
          targetObjectPath: finalTargetPath,
          functionName: 'NonExistentFunc',
        });

        const { result } = await integrationPlugin.execute(context);

        expect(result.status).toBe('failure');
        expect(result.error).toBe('Symbol not found');
        expect(result.output).toBe(`Symbol \`NonExistentFunc\` not found.

Available symbols in current object: ActualFunc.

Did you named your function as \`NonExistentFunc\`?`);
      } finally {
        if (compiledObjPath) {
          fs.unlink(compiledObjPath).catch(() => {});
        }
        if (targetObjPath) {
          fs.unlink(targetObjPath).catch(() => {});
        }
        if (finalTargetPath) {
          fs.unlink(finalTargetPath).catch(() => {});
        }
      }
    });
  });
});
