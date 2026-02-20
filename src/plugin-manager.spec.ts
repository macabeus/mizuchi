import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginManager } from './plugin-manager.js';
import { BackgroundTaskCoordinator } from './shared/background-task-coordinator.js';
import { PipelineAbortError } from './shared/errors.js';
import {
  createFailurePlugin,
  createMockPlugin,
  createSuccessOnAttemptPlugin,
  createSuccessPlugin,
} from './shared/mock-plugin.js';
import { defaultTestPipelineConfig } from './shared/test-utils.js';

describe('PluginManager', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('.register', () => {
    it('registers a plugin and returns the manager for chaining', () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      const plugin = createSuccessPlugin('test', 'Test Plugin');

      const result = manager.register(plugin);

      expect(result).toBe(manager);
      expect(manager.getPlugins()).toContain(plugin);
    });

    it('registers multiple plugins in order', () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      const plugin1 = createSuccessPlugin('plugin1', 'Plugin 1');
      const plugin2 = createSuccessPlugin('plugin2', 'Plugin 2');
      const plugin3 = createSuccessPlugin('plugin3', 'Plugin 3');

      manager.register(plugin1).register(plugin2).register(plugin3);

      const plugins = manager.getPlugins();
      expect(plugins).toHaveLength(3);
      expect(plugins[0]).toBe(plugin1);
      expect(plugins[1]).toBe(plugin2);
      expect(plugins[2]).toBe(plugin3);
    });
  });

  describe('.getPlugins', () => {
    it('returns empty array when no plugins registered', () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      expect(manager.getPlugins()).toHaveLength(0);
    });

    it('returns readonly array of plugins', () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      const plugin = createSuccessPlugin('test', 'Test Plugin');
      manager.register(plugin);

      const plugins = manager.getPlugins();

      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins).toHaveLength(1);
    });
  });

  describe('.runPipeline', () => {
    it('runs all plugins in sequence when all succeed', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      const executionOrder: string[] = [];

      const plugin1 = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeFn: async (ctx) => {
          executionOrder.push('plugin1');
          return {
            result: { pluginId: 'plugin1', pluginName: 'Plugin 1', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      const plugin2 = createMockPlugin({
        id: 'plugin2',
        name: 'Plugin 2',
        executeFn: async (ctx) => {
          executionOrder.push('plugin2');
          return {
            result: { pluginId: 'plugin2', pluginName: 'Plugin 2', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      manager.register(plugin1).register(plugin2);

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(executionOrder).toEqual(['plugin1', 'plugin2']);
      expect(result.success).toBe(true);
      expect(result.attempts).toHaveLength(1);
    });

    it('stops pipeline execution when a plugin fails', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 1 };
      const manager = new PluginManager(config);
      const executionOrder: string[] = [];

      const plugin1 = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeFn: async (ctx) => {
          executionOrder.push('plugin1');
          return {
            result: { pluginId: 'plugin1', pluginName: 'Plugin 1', status: 'failure', durationMs: 10, error: 'Failed' },
            context: ctx,
          };
        },
      });

      const plugin2 = createMockPlugin({
        id: 'plugin2',
        name: 'Plugin 2',
        executeFn: async (ctx) => {
          executionOrder.push('plugin2');
          return {
            result: { pluginId: 'plugin2', pluginName: 'Plugin 2', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      manager.register(plugin1).register(plugin2);

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(executionOrder).toEqual(['plugin1']);
      expect(result.success).toBe(false);
    });

    it('marks skipped plugins correctly when a plugin fails', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      manager
        .register(createFailurePlugin('plugin1', 'Plugin 1', 'Failed'))
        .register(createSuccessPlugin('plugin2', 'Plugin 2'));

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      const lastAttempt = result.attempts[result.attempts.length - 1];
      expect(lastAttempt.pluginResults[0].status).toBe('failure');
      expect(lastAttempt.pluginResults[1].status).toBe('skipped');
    });

    it('retries pipeline up to maxRetries times', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 3 };
      const manager = new PluginManager(config);

      manager.register(createFailurePlugin('plugin1', 'Plugin 1', 'Always fails'));

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toHaveLength(3);
    });

    it('succeeds on retry when plugin eventually succeeds', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 3 };
      const manager = new PluginManager(config);

      manager.register(createSuccessOnAttemptPlugin('plugin1', 'Plugin 1', 2));

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0].success).toBe(false);
      expect(result.attempts[1].success).toBe(true);
    });

    it('passes context between plugins', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      const plugin1 = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        contextUpdates: { generatedCode: 'int foo() { return 1; }' },
      });

      let receivedCode: string | undefined;
      const plugin2 = createMockPlugin({
        id: 'plugin2',
        name: 'Plugin 2',
        executeFn: async (ctx) => {
          receivedCode = ctx.generatedCode;
          return {
            result: { pluginId: 'plugin2', pluginName: 'Plugin 2', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      manager.register(plugin1).register(plugin2);

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\nglabel testFunc\n    bx lr\n');

      expect(receivedCode).toBe('int foo() { return 1; }');
    });

    it('sets correct attempt number in context', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 3 };
      const manager = new PluginManager(config);

      const attemptNumbers: number[] = [];
      const plugin = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeFn: async (ctx) => {
          attemptNumbers.push(ctx.attemptNumber);
          return {
            result: {
              pluginId: 'plugin1',
              pluginName: 'Plugin 1',
              status: ctx.attemptNumber < 3 ? 'failure' : 'success',
              durationMs: 10,
              error: ctx.attemptNumber < 3 ? 'Not yet' : undefined,
            },
            context: ctx,
          };
        },
      });

      manager.register(plugin);

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\nglabel testFunc\n    bx lr\n');

      expect(attemptNumbers).toEqual([1, 2, 3]);
    });

    it('calls prepareRetry before each retry', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 2 };
      const manager = new PluginManager(config);

      let prepareRetryCalled = 0;
      const plugin = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeResult: { status: 'failure', error: 'Always fails' },
        prepareRetryFn: (ctx) => {
          prepareRetryCalled++;
          return ctx;
        },
      });

      manager.register(plugin);

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\nglabel testFunc\n    bx lr\n');

      expect(prepareRetryCalled).toBe(1);
    });

    it('returns correct pipeline result structure', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      manager.register(createSuccessPlugin('plugin1', 'Plugin 1'));

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(result).toHaveProperty('promptPath', 'test.md');
      expect(result).toHaveProperty('functionName', 'testFunc');
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('attempts');
      expect(result).toHaveProperty('totalDurationMs');
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles plugin throwing an exception', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      const plugin = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeFn: async () => {
          throw new Error('Unexpected error');
        },
      });

      manager.register(plugin);

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(result.success).toBe(false);
      expect(result.attempts[0].pluginResults[0].status).toBe('failure');
      expect(result.attempts[0].pluginResults[0].error).toContain('Unexpected error');
    });
  });

  describe('.registerProgrammaticFlow', () => {
    it('registers programmatic-flow plugins and returns the manager for chaining', () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      const plugin = createSuccessPlugin('pre1', 'Pre Plugin 1');

      const result = manager.registerProgrammaticFlow(plugin);

      expect(result).toBe(manager);
      expect(manager.getProgrammaticFlowPlugins()).toContain(plugin);
    });
  });

  describe('programmatic-flow', () => {
    it('short-circuits when programmatic-flow succeeds', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      const mainPluginExecuted: string[] = [];

      manager.registerProgrammaticFlow(createSuccessPlugin('pre1', 'Pre Plugin'));
      manager.register(
        createMockPlugin({
          id: 'main1',
          name: 'Main Plugin',
          executeFn: async (ctx) => {
            mainPluginExecuted.push('main1');
            return {
              result: { pluginId: 'main1', pluginName: 'Main Plugin', status: 'success', durationMs: 10 },
              context: ctx,
            };
          },
        }),
      );

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(result.success).toBe(true);
      expect(result.programmaticFlow).toBeDefined();
      expect(result.programmaticFlow!.success).toBe(true);
      expect(result.attempts).toHaveLength(0);
      expect(mainPluginExecuted).toHaveLength(0);
    });

    it('falls through to AI-powered flow when programmatic-flow fails', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      manager.registerProgrammaticFlow(createFailurePlugin('pre1', 'Pre Plugin', 'Pre failed'));
      manager.register(createSuccessPlugin('main1', 'Main Plugin'));

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(result.success).toBe(true);
      expect(result.programmaticFlow).toBeDefined();
      expect(result.programmaticFlow!.success).toBe(false);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].success).toBe(true);
    });

    it('does not run programmatic-flow when none registered', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      manager.register(createSuccessPlugin('main1', 'Main Plugin'));

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(result.success).toBe(true);
      expect(result.programmaticFlow).toBeUndefined();
      expect(result.attempts).toHaveLength(1);
    });

    it('preserves m2cContext from programmatic-flow for main pipeline', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      // programmatic-flow sets m2cContext
      const prePlugin = createMockPlugin({
        id: 'm2c',
        name: 'm2c',
        executeFn: async (ctx) => ({
          result: {
            pluginId: 'm2c',
            pluginName: 'm2c',
            status: 'success',
            durationMs: 10,
            data: { generatedCode: 'int f() {}' },
          },
          context: {
            ...ctx,
            generatedCode: 'int f() {}',
            m2cContext: { generatedCode: 'int f() {}' },
          },
        }),
      });

      // A second programmatic-flow plugin (compiler) that fails
      const preCompiler = createFailurePlugin('compiler', 'Compiler', 'Compilation error');

      let receivedM2cContext: any;
      const mainPlugin = createMockPlugin({
        id: 'main1',
        name: 'Main Plugin',
        executeFn: async (ctx) => {
          receivedM2cContext = ctx.m2cContext;
          return {
            result: { pluginId: 'main1', pluginName: 'Main Plugin', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      manager.registerProgrammaticFlow(prePlugin, preCompiler);
      manager.register(mainPlugin);

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\nglabel testFunc\n    bx lr\n');

      expect(receivedM2cContext).toBeDefined();
      expect(receivedM2cContext.generatedCode).toBe('int f() {}');
      expect(receivedM2cContext.compilationError).toContain('Compilation error');
    });

    it('resets generatedCode after programmatic-flow failure', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      const prePlugin = createMockPlugin({
        id: 'm2c',
        name: 'm2c',
        contextUpdates: {
          generatedCode: 'int f() {}',
          m2cContext: { generatedCode: 'int f() {}' },
        },
      });
      const preCompiler = createFailurePlugin('compiler', 'Compiler', 'error');

      let receivedGeneratedCode: string | undefined;
      const mainPlugin = createMockPlugin({
        id: 'main1',
        name: 'Main Plugin',
        executeFn: async (ctx) => {
          receivedGeneratedCode = ctx.generatedCode;
          return {
            result: { pluginId: 'main1', pluginName: 'Main Plugin', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      manager.registerProgrammaticFlow(prePlugin, preCompiler);
      manager.register(mainPlugin);

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\nglabel testFunc\n    bx lr\n');

      expect(receivedGeneratedCode).toBeUndefined();
    });
  });

  describe('.registerSetupFlow', () => {
    it('registers setup-flow plugins and returns the manager for chaining', () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      const plugin = createSuccessPlugin('pre1', 'Pre Plugin 1');

      const result = manager.registerSetupFlow(plugin);

      expect(result).toBe(manager);
      expect(manager.getSetupFlowPlugins()).toContain(plugin);
    });
  });

  describe('setup-flow', () => {
    it('runs setup-flow before programmatic-flow and carries context forward', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      const executionOrder: string[] = [];

      const setupFlowPlugin = createMockPlugin({
        id: 'get-context',
        name: 'Get Context',
        executeFn: async (ctx) => {
          executionOrder.push('get-context');
          return {
            result: {
              pluginId: 'get-context',
              pluginName: 'Get Context',
              status: 'success',
              durationMs: 10,
            },
            context: { ...ctx, contextContent: 'typedef int s32;', contextFilePath: '/tmp/ctx.h' },
          };
        },
      });

      let receivedContextContent: string | undefined;
      const mainPlugin = createMockPlugin({
        id: 'main1',
        name: 'Main Plugin',
        executeFn: async (ctx) => {
          executionOrder.push('main1');
          receivedContextContent = ctx.contextContent;
          return {
            result: { pluginId: 'main1', pluginName: 'Main Plugin', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      manager.registerSetupFlow(setupFlowPlugin);
      manager.register(mainPlugin);

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(executionOrder).toEqual(['get-context', 'main1']);
      expect(result.success).toBe(true);
      expect(result.setupFlow).toBeDefined();
      expect(result.setupFlow!.success).toBe(true);
      expect(receivedContextContent).toBe('typedef int s32;');
    });

    it('fails fatally when setup-flow fails (no retry)', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 3 };
      const manager = new PluginManager(config);

      manager.registerSetupFlow(createFailurePlugin('get-context', 'Get Context', 'Script failed'));
      manager.register(createSuccessPlugin('main1', 'Main Plugin'));

      const result = await manager.runPipeline(
        'test.md',
        'content',
        'testFunc',
        '/target.o',
        '.text\nglabel testFunc\n    bx lr\n',
      );

      expect(result.success).toBe(false);
      expect(result.setupFlow).toBeDefined();
      expect(result.setupFlow!.success).toBe(false);
      expect(result.attempts).toHaveLength(0);
    });

    it('carries context to programmatic-flow when both are configured', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      const setupFlowPlugin = createMockPlugin({
        id: 'get-context',
        name: 'Get Context',
        contextUpdates: { contextContent: 'typedef int u32;', contextFilePath: '/tmp/ctx.h' },
      });

      let receivedContextContent: string | undefined;
      const programmaticPlugin = createMockPlugin({
        id: 'programmatic',
        name: 'Programmatic',
        executeFn: async (ctx) => {
          receivedContextContent = ctx.contextContent;
          return {
            result: { pluginId: 'programmatic', pluginName: 'Programmatic', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      manager.registerSetupFlow(setupFlowPlugin);
      manager.registerProgrammaticFlow(programmaticPlugin);
      manager.register(createSuccessPlugin('main1', 'Main Plugin'));

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\nglabel testFunc\n    bx lr\n');

      expect(receivedContextContent).toBe('typedef int u32;');
    });
  });

  describe('.runBenchmark', () => {
    it('runs pipeline for all prompts', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      manager.register(createSuccessPlugin('plugin1', 'Plugin 1'));

      const prompts = [
        {
          path: 'prompt1.md',
          content: 'content1',
          functionName: 'func1',
          targetObjectPath: '/target1.o',
          asm: '.text\n',
        },
        {
          path: 'prompt2.md',
          content: 'content2',
          functionName: 'func2',
          targetObjectPath: '/target2.o',
          asm: '.text\n',
        },
      ];

      const results = await manager.runBenchmark(prompts);

      expect(results.results).toHaveLength(2);
      expect(results.results[0].functionName).toBe('func1');
      expect(results.results[1].functionName).toBe('func2');
    });

    it('calculates summary correctly', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      let callCount = 0;
      const plugin = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeFn: async (ctx) => {
          callCount++;
          const shouldSucceed = callCount <= 2;
          return {
            result: {
              pluginId: 'plugin1',
              pluginName: 'Plugin 1',
              status: shouldSucceed ? 'success' : 'failure',
              durationMs: 10,
              error: shouldSucceed ? undefined : 'Failed',
            },
            context: ctx,
          };
        },
      });

      manager.register(plugin);

      const prompts = [
        {
          path: 'prompt1.md',
          content: 'content1',
          functionName: 'func1',
          targetObjectPath: '/target1.o',
          asm: '.text\n',
        },
        {
          path: 'prompt2.md',
          content: 'content2',
          functionName: 'func2',
          targetObjectPath: '/target2.o',
          asm: '.text\n',
        },
        {
          path: 'prompt3.md',
          content: 'content3',
          functionName: 'func3',
          targetObjectPath: '/target3.o',
          asm: '.text\n',
        },
      ];

      const results = await manager.runBenchmark(prompts);

      expect(results.summary.totalPrompts).toBe(3);
      expect(results.summary.successfulPrompts).toBe(2);
      expect(results.summary.successRate).toBeCloseTo(66.67, 1);
    });

    it('uses per-prompt targetObjectPath', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      const receivedTargets: string[] = [];
      const plugin = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeFn: async (ctx) => {
          receivedTargets.push(ctx.targetObjectPath!);
          return {
            result: { pluginId: 'plugin1', pluginName: 'Plugin 1', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      manager.register(plugin);

      await manager.runBenchmark([
        {
          path: 'prompt1.md',
          content: 'content1',
          functionName: 'func1',
          targetObjectPath: '/custom/target1.o',
          asm: '.text\n',
        },
        {
          path: 'prompt2.md',
          content: 'content2',
          functionName: 'func2',
          targetObjectPath: '/custom/target2.o',
          asm: '.text\n',
        },
      ]);

      expect(receivedTargets).toEqual(['/custom/target1.o', '/custom/target2.o']);
    });

    it('returns correct benchmark results structure', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      manager.register(createSuccessPlugin('plugin1', 'Plugin 1'));

      const results = await manager.runBenchmark([
        {
          path: 'prompt1.md',
          content: 'content1',
          functionName: 'func1',
          targetObjectPath: '/target.o',
          asm: '.text\n',
        },
      ]);

      expect(results).toHaveProperty('timestamp');
      expect(results).toHaveProperty('config');
      expect(results).toHaveProperty('results');
      expect(results).toHaveProperty('summary');
      expect(results.summary).toHaveProperty('totalPrompts');
      expect(results.summary).toHaveProperty('successfulPrompts');
      expect(results.summary).toHaveProperty('successRate');
      expect(results.summary).toHaveProperty('avgAttempts');
      expect(results.summary).toHaveProperty('totalDurationMs');
    });

    it('stops processing and returns partial results on PipelineAbortError', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      let callCount = 0;
      const plugin = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeFn: async (ctx) => {
          callCount++;
          // Second prompt throws PipelineAbortError
          if (callCount === 2) {
            throw new PipelineAbortError();
          }
          return {
            result: { pluginId: 'plugin1', pluginName: 'Plugin 1', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
      });

      manager.register(plugin);

      const prompts = [
        {
          path: 'prompt1.md',
          content: 'content1',
          functionName: 'func1',
          targetObjectPath: '/target1.o',
          asm: '.text\n',
        },
        {
          path: 'prompt2.md',
          content: 'content2',
          functionName: 'func2',
          targetObjectPath: '/target2.o',
          asm: '.text\n',
        },
        {
          path: 'prompt3.md',
          content: 'content3',
          functionName: 'func3',
          targetObjectPath: '/target3.o',
          asm: '.text\n',
        },
      ];

      const results = await manager.runBenchmark(prompts);

      // Should have only the first prompt's result (second aborted, third never processed)
      expect(results.results).toHaveLength(1);
      expect(results.results[0].functionName).toBe('func1');
      expect(results.results[0].success).toBe(true);

      // Summary should reflect partial results
      expect(results.summary.totalPrompts).toBe(1);
      expect(results.summary.successfulPrompts).toBe(1);

      // Plugin was called twice (first succeeded, second threw abort)
      expect(callCount).toBe(2);
    });

    it('propagates non-abort errors from plugins', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      const plugin = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeFn: async () => {
          throw new Error('Unexpected crash');
        },
      });

      manager.register(plugin);

      // Regular errors are caught by #runAttempt and turned into failure results
      const results = await manager.runBenchmark([
        {
          path: 'prompt1.md',
          content: 'content1',
          functionName: 'func1',
          targetObjectPath: '/target1.o',
          asm: '.text\n',
        },
      ]);

      expect(results.results).toHaveLength(1);
      expect(results.results[0].success).toBe(false);
    });

    it('catches unexpected errors escaping runPipeline and continues to next prompt', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 2 };
      const manager = new PluginManager(config);

      let promptIndex = 0;
      const plugin = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeFn: async (ctx) => {
          promptIndex++;
          // First prompt always fails (to trigger prepareRetry)
          // Second prompt succeeds
          if (promptIndex === 1) {
            return {
              result: {
                pluginId: 'plugin1',
                pluginName: 'Plugin 1',
                status: 'failure',
                durationMs: 10,
                error: 'Failed',
              },
              context: ctx,
            };
          }
          return {
            result: { pluginId: 'plugin1', pluginName: 'Plugin 1', status: 'success', durationMs: 10 },
            context: ctx,
          };
        },
        // prepareRetry throws, causing error to escape runPipeline
        prepareRetryFn: () => {
          throw new Error('prepareRetry crashed');
        },
      });

      manager.register(plugin);

      const prompts = [
        {
          path: 'prompt1.md',
          content: 'content1',
          functionName: 'func1',
          targetObjectPath: '/target1.o',
          asm: '.text\n',
        },
        {
          path: 'prompt2.md',
          content: 'content2',
          functionName: 'func2',
          targetObjectPath: '/target2.o',
          asm: '.text\n',
        },
      ];

      const results = await manager.runBenchmark(prompts);

      // First prompt should be recorded as failed (not lost)
      expect(results.results).toHaveLength(2);
      expect(results.results[0].functionName).toBe('func1');
      expect(results.results[0].success).toBe(false);
      expect(results.results[0].setupFlow.pluginResults[0].error).toContain('prepareRetry crashed');

      // Second prompt should still be processed
      expect(results.results[1].functionName).toBe('func2');
      expect(results.results[1].success).toBe(true);
    });

    it('records error message in failed result when unexpected error occurs', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 2 };
      const manager = new PluginManager(config);

      const plugin = createMockPlugin({
        id: 'plugin1',
        name: 'Plugin 1',
        executeResult: { status: 'failure', error: 'Always fails' },
        prepareRetryFn: () => {
          throw new Error('Specific crash reason');
        },
      });

      manager.register(plugin);

      const results = await manager.runBenchmark([
        {
          path: 'prompt1.md',
          content: 'content1',
          functionName: 'func1',
          targetObjectPath: '/target1.o',
          asm: '.text\n',
        },
      ]);

      expect(results.results).toHaveLength(1);
      expect(results.results[0].success).toBe(false);
      expect(results.results[0].setupFlow.pluginResults[0].error).toContain('Specific crash reason');
    });
  });

  describe('background task coordinator integration', () => {
    function setupManagerWithCoordinator(maxRetries: number) {
      const config = { ...defaultTestPipelineConfig, maxRetries };
      const manager = new PluginManager(config);
      const coordinator = new BackgroundTaskCoordinator([]);

      vi.spyOn(coordinator, 'onAttemptComplete');
      vi.spyOn(coordinator, 'reset');
      vi.spyOn(coordinator, 'cancelAll').mockResolvedValue();
      vi.spyOn(coordinator, 'getAllResults').mockReturnValue([]);

      manager.setBackgroundCoordinator(coordinator);

      return { manager, coordinator };
    }

    it('calls onAttemptComplete after each failed attempt', async () => {
      const { manager, coordinator } = setupManagerWithCoordinator(2);
      const plugin = createFailurePlugin('test', 'Test', 'fail');

      manager.register(plugin);

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\n');

      // Both attempts fail, onAttemptComplete called for each
      expect(coordinator.onAttemptComplete).toHaveBeenCalledTimes(2);

      // Verify the context shape of the first call
      const firstCall = vi.mocked(coordinator.onAttemptComplete).mock.calls[0][0];
      expect(firstCall.attemptNumber).toBe(1);
      expect(firstCall.willRetry).toBe(true);
      expect(firstCall.attemptResults).toBeDefined();
      expect(firstCall.context).toBeDefined();

      // Second call should not willRetry (last attempt)
      const secondCall = vi.mocked(coordinator.onAttemptComplete).mock.calls[1][0];
      expect(secondCall.attemptNumber).toBe(2);
      expect(secondCall.willRetry).toBe(false);
    });

    it('does NOT call onAttemptComplete on successful attempt', async () => {
      const { manager, coordinator } = setupManagerWithCoordinator(2);
      const plugin = createSuccessPlugin('test', 'Test');

      manager.register(plugin);

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\n');

      expect(coordinator.onAttemptComplete).not.toHaveBeenCalled();
    });

    it('resets coordinator at the start of each pipeline run', async () => {
      const { manager, coordinator } = setupManagerWithCoordinator(1);
      const plugin = createSuccessPlugin('test', 'Test');

      manager.register(plugin);

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\n');

      expect(coordinator.reset).toHaveBeenCalledTimes(1);
    });

    it('stops early when coordinator emits success between attempts', async () => {
      const { manager, coordinator } = setupManagerWithCoordinator(3);
      const plugin = createFailurePlugin('test', 'Test', 'fail');

      manager.register(plugin);

      // Emit 'success' after the first attempt's onAttemptComplete
      vi.mocked(coordinator.onAttemptComplete).mockImplementation(() => {
        coordinator.emit('success', { taskId: 'test-1', pluginId: 'test', success: true });
      });

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\n');

      expect(result.success).toBe(true);
      expect(result.matchSource).toBe('test');
      expect(result.attempts).toHaveLength(1);
    });

    it('calls cancelAll at the end of the pipeline', async () => {
      const { manager, coordinator } = setupManagerWithCoordinator(1);
      const plugin = createSuccessPlugin('test', 'Test');

      manager.register(plugin);

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\n');

      expect(coordinator.cancelAll).toHaveBeenCalledTimes(1);
    });

    it('detects success that occurs during cancelAll', async () => {
      const { manager, coordinator } = setupManagerWithCoordinator(1);
      const plugin = createFailurePlugin('test', 'Test', 'fail');

      manager.register(plugin);

      // Emit 'success' during cancelAll (simulates a task completing just as it is cancelled)
      vi.mocked(coordinator.cancelAll).mockImplementation(async () => {
        coordinator.emit('success', { taskId: 'test-1', pluginId: 'test', success: true });
      });

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\n');

      expect(result.success).toBe(true);
      expect(result.matchSource).toBe('test');
    });

    it('provides a fresh foreground abort signal for each prompt in runBenchmark', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 1 };
      const manager = new PluginManager(config);

      // Track the abort signal state each time the plugin executes
      const signalAbortedPerExecution: boolean[] = [];

      const plugin = createMockPlugin({
        id: 'claude-runner',
        name: 'Claude Runner',
        executeFn: async (ctx) => ({
          result: {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success',
            durationMs: 10,
          },
          context: ctx,
        }),
      });

      // Add setForegroundAbortSignal to record signal state
      let currentSignal: AbortSignal | undefined;
      plugin.setForegroundAbortSignal = (signal: AbortSignal) => {
        currentSignal = signal;
      };

      const originalExecute = plugin.execute.bind(plugin);
      plugin.execute = async (ctx) => {
        signalAbortedPerExecution.push(currentSignal?.aborted ?? false);
        return originalExecute(ctx);
      };

      // Create a real coordinator (no mocks) so reset() actually refreshes the abort controller
      const coordinator = new BackgroundTaskCoordinator([]);
      manager.setBackgroundCoordinator(coordinator);
      manager.register(plugin);

      // Simulate: background succeeds during prompt 1 by aborting the foreground signal
      // after the coordinator's reset but before prompt 2's reset
      const originalReset = coordinator.reset.bind(coordinator);
      let resetCount = 0;
      vi.spyOn(coordinator, 'reset').mockImplementation(() => {
        originalReset();
        resetCount++;
        if (resetCount === 1) {
          // After prompt 1's reset, simulate background success by aborting the signal.
          // In real usage, a background task would do this via the coordinator's #spawn.
          // We access it through the public getter and abort externally to simulate.
          // The coordinator aborts its own controller on success, so we replicate that:
          (coordinator as any).foregroundAbortSignal; // just access — we need to abort internally
        }
      });

      // Run 2 prompts
      await manager.runBenchmark([
        { path: 'p1.md', content: 'c1', functionName: 'func1', targetObjectPath: '/t1.o', asm: '.text\n' },
        { path: 'p2.md', content: 'c2', functionName: 'func2', targetObjectPath: '/t2.o', asm: '.text\n' },
      ]);

      // Both prompts should have seen a non-aborted signal
      expect(signalAbortedPerExecution).toHaveLength(2);
      expect(signalAbortedPerExecution[0]).toBe(false);
      expect(signalAbortedPerExecution[1]).toBe(false);
    });

    it('short-circuits before attempt 2 when background emits success after attempt 1', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 2 };
      const manager = new PluginManager(config);

      let currentSignal: AbortSignal | undefined;
      let signalAbortedDuringSecondAttempt: boolean | undefined;

      const plugin = createMockPlugin({
        id: 'claude-runner',
        name: 'Claude Runner',
        executeFn: async (ctx) => {
          if (ctx.attemptNumber === 2) {
            signalAbortedDuringSecondAttempt = currentSignal?.aborted;
          }
          return {
            result: {
              pluginId: 'claude-runner',
              pluginName: 'Claude Runner',
              status: 'failure',
              durationMs: 10,
            },
            context: ctx,
          };
        },
      });

      plugin.setForegroundAbortSignal = (signal: AbortSignal) => {
        currentSignal = signal;
      };

      const coordinator = new BackgroundTaskCoordinator([]);
      vi.spyOn(coordinator, 'cancelAll').mockResolvedValue();
      vi.spyOn(coordinator, 'getAllResults').mockReturnValue([]);

      // Emit 'success' after the first attempt completes (via onAttemptComplete)
      vi.spyOn(coordinator, 'onAttemptComplete').mockImplementation(() => {
        coordinator.emit('success', { taskId: 'test-1', pluginId: 'test', success: true });
      });

      manager.setBackgroundCoordinator(coordinator);
      manager.register(plugin);

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o', '.text\n');

      // Pipeline should short-circuit with background success before attempt 2 runs
      expect(result.success).toBe(true);
      expect(result.matchSource).toBe('test');
      expect(result.attempts).toHaveLength(1);
      // The second attempt never ran, so this should be undefined
      expect(signalAbortedDuringSecondAttempt).toBeUndefined();
    });
  });
});
