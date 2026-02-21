import fs from 'fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getArmCompilerScript } from '~/shared/c-compiler/__fixtures__/index.js';
import { CCompiler } from '~/shared/c-compiler/c-compiler.js';
import { DecompPermuterResult } from '~/shared/decomp-permuter.js';
import { createTestContext, defaultTestPipelineConfig } from '~/shared/test-utils.js';
import type { BackgroundSpawnContext, PluginResult } from '~/shared/types.js';

import { DecompPermuterPlugin } from './decomp-permuter-plugin.js';

describe('DecompPermuterPlugin', () => {
  describe('metadata', () => {
    const compilerScript = getArmCompilerScript();
    const cCompiler = new CCompiler(compilerScript);

    it('has correct plugin id and name', () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 10, timeoutMs: 10000, flags: ['--show-errors'] },
        cCompiler,
      );

      expect(plugin.id).toBe('decomp-permuter');
      expect(plugin.name).toBe('decomp-permuter');
    });
  });

  describe('.execute', () => {
    const compilerScript = getArmCompilerScript();
    const cCompiler = new CCompiler(compilerScript);

    // Simple ARM function for testing
    const MATCHING_C_CODE = 'int SimpleAdd(int a, int b) { return a + b; }';
    const NON_MATCHING_C_CODE = 'int SimpleAdd(int a, int b) { return a - b; }';

    let targetObjPath: string;
    let compiledObjPath: string;

    beforeAll(async () => {
      // Compile the matching code to create target .o
      const targetResult = await cCompiler.compile('SimpleAdd', MATCHING_C_CODE, '');
      expect(targetResult.success).toBe(true);
      if (!targetResult.success) {
        throw new Error('Failed to compile target code');
      }
      targetObjPath = targetResult.objPath;

      // Compile the non-matching code to get a compiled .o (simulating pipeline state)
      const compiledResult = await cCompiler.compile('SimpleAdd', NON_MATCHING_C_CODE, '');
      expect(compiledResult.success).toBe(true);
      if (!compiledResult.success) {
        throw new Error('Failed to compile non-matching code');
      }
      compiledObjPath = compiledResult.objPath;
    });

    afterAll(async () => {
      if (targetObjPath) {
        await fs.unlink(targetObjPath).catch(() => {});
      }
      if (compiledObjPath) {
        await fs.unlink(compiledObjPath).catch(() => {});
      }
    });

    it('runs the permuter on non-matching code', async () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 2, timeoutMs: 15000, flags: ['--show-errors', '--seed', '98'] },
        cCompiler,
      );

      const context = createTestContext({
        functionName: 'SimpleAdd',
        generatedCode: NON_MATCHING_C_CODE,
        compiledObjectPath: compiledObjPath,
        targetObjectPath: targetObjPath,
        config: defaultTestPipelineConfig,
      });

      const { result } = await plugin.execute(context);

      expect(result.pluginId).toBe('decomp-permuter');
      expect(result.data).toBeDefined();
      expect(result.data!.baseScore).toBeGreaterThan(0);
      expect(result.data!.iterationsRun).toBeGreaterThan(0);
    }, 20000);

    it('reports base score 0 when code already matches', async () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 1, timeoutMs: 10000, flags: ['--show-errors'] },
        cCompiler,
      );

      const context = createTestContext({
        functionName: 'SimpleAdd',
        generatedCode: MATCHING_C_CODE,
        compiledObjectPath: compiledObjPath,
        targetObjectPath: targetObjPath,
        config: defaultTestPipelineConfig,
      });

      const { result } = await plugin.execute(context);

      expect(result.data).toBeDefined();
      expect(result.data!.baseScore).toBe(0);
    }, 15000);

    it('terminates promptly with -j 4 flag', async () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 2, timeoutMs: 10000, flags: ['--show-errors', '-j', '4', '--seed', '98'] },
        cCompiler,
      );

      const context = createTestContext({
        functionName: 'SimpleAdd',
        generatedCode: NON_MATCHING_C_CODE,
        compiledObjectPath: compiledObjPath,
        targetObjectPath: targetObjPath,
        config: defaultTestPipelineConfig,
      });

      const start = Date.now();
      const { result } = await plugin.execute(context);
      const elapsed = Date.now() - start;

      expect(result.pluginId).toBe('decomp-permuter');
      expect(result.data).toBeDefined();
      expect(result.data!.baseScore).toBeGreaterThan(0);
      // Should terminate well before timeout. Without the process group
      // kill fix, -j 4 spawns Python workers that keep pipes open indefinitely,
      // causing run() to hang until timeout.
      expect(elapsed).toBeLessThan(5000);
    }, 15000);

    it('returns failure when no generatedCode is available', async () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 10, timeoutMs: 10000, flags: ['--show-errors'] },
        cCompiler,
      );

      const context = createTestContext({
        functionName: 'SimpleAdd',
        generatedCode: undefined,
        compiledObjectPath: compiledObjPath,
        targetObjectPath: targetObjPath,
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('No generated code');
    });

    it('returns failure when no compiledObjectPath is available', async () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 10, timeoutMs: 10000, flags: ['--show-errors'] },
        cCompiler,
      );

      const context = createTestContext({
        functionName: 'SimpleAdd',
        generatedCode: NON_MATCHING_C_CODE,
        compiledObjectPath: undefined,
        targetObjectPath: targetObjPath,
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('compile before running');
    });

    it('returns failure when no targetObjectPath is available', async () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 10, timeoutMs: 10000, flags: ['--show-errors'] },
        cCompiler,
      );

      const context = createTestContext({
        functionName: 'SimpleAdd',
        generatedCode: NON_MATCHING_C_CODE,
        compiledObjectPath: compiledObjPath,
        targetObjectPath: undefined,
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('No target object path');
    });
  });

  describe('.getReportSections', () => {
    const compilerScript = getArmCompilerScript();
    const cCompiler = new CCompiler(compilerScript);

    it('returns permuter results section when data is present', () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 10, timeoutMs: 10000, flags: ['--show-errors'] },
        cCompiler,
      );
      const result: PluginResult<DecompPermuterResult> = {
        pluginId: 'decomp-permuter',
        pluginName: 'decomp-permuter',
        status: 'failure' as const,
        durationMs: 5000,
        data: {
          baseScore: 200,
          bestScore: 100,
          iterationsRun: 50,
          perfectMatch: false,
          stdout: 'base score = 200\n',
          stderr: '',
        },
      };

      const sections = plugin.getReportSections(result);

      expect(sections.length).toBeGreaterThanOrEqual(1);
      const messageSection = sections.find((s) => s.type === 'message' && s.title === 'Permuter Results');
      expect(messageSection).toBeDefined();
    });

    it('returns code section when bestCode is present', () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 10, timeoutMs: 10000, flags: ['--show-errors'] },
        cCompiler,
      );
      const result: PluginResult<DecompPermuterResult> = {
        pluginId: 'decomp-permuter',
        pluginName: 'decomp-permuter',
        status: 'success' as const,
        durationMs: 5000,
        data: {
          baseScore: 200,
          bestScore: 0,
          iterationsRun: 50,
          bestCode: 'int SimpleAdd(int a, int b) { return a + b; }',
          perfectMatch: true,
          stdout: 'base score = 200\nnew best score! (0\n',
          stderr: '',
        },
      };

      const sections = plugin.getReportSections(result);

      const codeSection = sections.find((s) => s.type === 'code');
      expect(codeSection).toBeDefined();
      if (codeSection && codeSection.type === 'code') {
        expect(codeSection.title).toBe('Best Permuted Code');
        expect(codeSection.code).toContain('SimpleAdd');
      }
    });

    it('returns error section when there is an error', () => {
      const plugin = new DecompPermuterPlugin(
        { enable: true, maxIterations: 10, timeoutMs: 10000, flags: ['--show-errors'] },
        cCompiler,
      );
      const result = {
        pluginId: 'decomp-permuter',
        pluginName: 'decomp-permuter',
        status: 'failure' as const,
        durationMs: 100,
        error: 'permuter failed',
      };

      const sections = plugin.getReportSections(result);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('message');
      expect(sections[0].title).toBe('Error');
    });
  });

  describe('.background', () => {
    const compilerScript = getArmCompilerScript();
    const cCompiler = new CCompiler(compilerScript);

    function createPlugin() {
      return new DecompPermuterPlugin(
        { enable: true, maxIterations: 10, timeoutMs: 10000, flags: ['--show-errors'] },
        cCompiler,
      );
    }

    function makeSpawnContext(overrides: Partial<BackgroundSpawnContext> = {}): BackgroundSpawnContext {
      return {
        attemptNumber: 1,
        willRetry: true,
        context: createTestContext({
          functionName: 'testFunc',
          generatedCode: 'int f() { return 1; }',
          targetObjectPath: '/target.o',
          config: defaultTestPipelineConfig,
        }),
        attemptResults: [
          {
            pluginId: 'objdiff',
            pluginName: 'Objdiff',
            status: 'failure',
            durationMs: 10,
            data: { differenceCount: 10 },
          },
        ],
        ...overrides,
      };
    }

    describe('.shouldSpawn', () => {
      it('returns config when score improves', () => {
        const plugin = createPlugin();
        const result = plugin.background.shouldSpawn(makeSpawnContext());

        expect(result).toMatchObject({
          code: 'int f() { return 1; }',
          functionName: 'testFunc',
          targetObjectPath: '/target.o',
        });
      });

      it('spawns when same score but different code', () => {
        const plugin = createPlugin();

        // First spawn with code A
        plugin.background.shouldSpawn(makeSpawnContext());

        // Second spawn with same score but different code
        const result = plugin.background.shouldSpawn(
          makeSpawnContext({
            context: createTestContext({
              functionName: 'testFunc',
              generatedCode: 'int f() { return 2; }',
              targetObjectPath: '/target.o',
              config: defaultTestPipelineConfig,
            }),
          }),
        );

        expect(result).not.toBeNull();
      });

      it('returns null when same score and same code', () => {
        const plugin = createPlugin();

        // First spawn
        plugin.background.shouldSpawn(makeSpawnContext());

        // Same code again
        const result = plugin.background.shouldSpawn(makeSpawnContext());

        expect(result).toBeNull();
      });

      it('returns null when score is worse', () => {
        const plugin = createPlugin();

        // First spawn with score 10
        plugin.background.shouldSpawn(makeSpawnContext());

        // Worse score
        const result = plugin.background.shouldSpawn(
          makeSpawnContext({
            context: createTestContext({
              functionName: 'testFunc',
              generatedCode: 'int f() { return 2; }',
              targetObjectPath: '/target.o',
              config: defaultTestPipelineConfig,
            }),
            attemptResults: [
              {
                pluginId: 'objdiff',
                pluginName: 'Objdiff',
                status: 'failure',
                durationMs: 10,
                data: { differenceCount: 15 },
              },
            ],
          }),
        );

        expect(result).toBeNull();
      });

      it('returns null when willRetry is false', () => {
        const plugin = createPlugin();
        const result = plugin.background.shouldSpawn(makeSpawnContext({ willRetry: false }));

        expect(result).toBeNull();
      });

      it('returns null when no objdiff result', () => {
        const plugin = createPlugin();
        const result = plugin.background.shouldSpawn(
          makeSpawnContext({
            attemptResults: [
              {
                pluginId: 'compiler',
                pluginName: 'Compiler',
                status: 'failure',
                durationMs: 10,
                error: 'Compilation failed',
              },
            ],
          }),
        );

        expect(result).toBeNull();
      });

      it('returns null when no generated code', () => {
        const plugin = createPlugin();
        const result = plugin.background.shouldSpawn(
          makeSpawnContext({
            context: createTestContext({
              functionName: 'testFunc',
              generatedCode: undefined,
              targetObjectPath: '/target.o',
              config: defaultTestPipelineConfig,
            }),
          }),
        );

        expect(result).toBeNull();
      });
    });

    describe('.isSuccess', () => {
      it('returns true for successful result', () => {
        const plugin = createPlugin();
        expect(
          plugin.background.isSuccess({
            perfectMatch: true,
            baseScore: 100,
            bestScore: 0,
            iterationsRun: 50,
            stdout: '',
            stderr: '',
          }),
        ).toBe(true);
      });

      it('returns false for unsuccessful result', () => {
        const plugin = createPlugin();
        expect(
          plugin.background.isSuccess({
            perfectMatch: false,
            baseScore: 100,
            bestScore: 50,
            iterationsRun: 50,
            stdout: '',
            stderr: '',
          }),
        ).toBe(false);
      });
    });

    describe('.toBackgroundTaskResult', () => {
      it('maps permuter result to background task result', () => {
        const plugin = createPlugin();
        const permuterResult: DecompPermuterResult = {
          perfectMatch: true,
          baseScore: 100,
          bestScore: 0,
          iterationsRun: 50,
          bestCode: 'int f() { return 1; }',
          stdout: 'output',
          stderr: '',
        };
        const metadata = {
          taskId: 'decomp-permuter-1',
          durationMs: 5000,
          triggeredByAttempt: 2,
          startTimestamp: '2024-01-01T00:00:00.000Z',
        };

        const result = plugin.background.toBackgroundTaskResult(permuterResult, metadata);

        expect(result.taskId).toBe('decomp-permuter-1');
        expect(result.pluginId).toBe('decomp-permuter');
        expect(result.success).toBe(true);
        expect(result.durationMs).toBe(5000);
        expect(result.triggeredByAttempt).toBe(2);
        expect(result.data).toBe(permuterResult);
      });
    });

    describe('.reset', () => {
      it('clears spawn tracking state', () => {
        const plugin = createPlugin();

        // Spawn once
        plugin.background.shouldSpawn(makeSpawnContext());

        // Same code would be skipped
        expect(plugin.background.shouldSpawn(makeSpawnContext())).toBeNull();

        // After reset, same code should spawn again
        plugin.background.reset!();
        expect(plugin.background.shouldSpawn(makeSpawnContext())).not.toBeNull();
      });
    });
  });
});
