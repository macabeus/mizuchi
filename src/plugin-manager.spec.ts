import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginManager } from './plugin-manager.js';
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

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

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

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

      expect(executionOrder).toEqual(['plugin1']);
      expect(result.success).toBe(false);
    });

    it('marks skipped plugins correctly when a plugin fails', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);

      manager
        .register(createFailurePlugin('plugin1', 'Plugin 1', 'Failed'))
        .register(createSuccessPlugin('plugin2', 'Plugin 2'));

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

      const lastAttempt = result.attempts[result.attempts.length - 1];
      expect(lastAttempt.pluginResults[0].status).toBe('failure');
      expect(lastAttempt.pluginResults[1].status).toBe('skipped');
    });

    it('retries pipeline up to maxRetries times', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 3 };
      const manager = new PluginManager(config);

      manager.register(createFailurePlugin('plugin1', 'Plugin 1', 'Always fails'));

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

      expect(result.success).toBe(false);
      expect(result.attempts).toHaveLength(3);
    });

    it('succeeds on retry when plugin eventually succeeds', async () => {
      const config = { ...defaultTestPipelineConfig, maxRetries: 3 };
      const manager = new PluginManager(config);

      manager.register(createSuccessOnAttemptPlugin('plugin1', 'Plugin 1', 2));

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

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

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

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

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

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

      await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

      expect(prepareRetryCalled).toBe(1);
    });

    it('returns correct pipeline result structure', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      manager.register(createSuccessPlugin('plugin1', 'Plugin 1'));

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

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

      const result = await manager.runPipeline('test.md', 'content', 'testFunc', '/target.o');

      expect(result.success).toBe(false);
      expect(result.attempts[0].pluginResults[0].status).toBe('failure');
      expect(result.attempts[0].pluginResults[0].error).toContain('Unexpected error');
    });
  });

  describe('.runBenchmark', () => {
    it('runs pipeline for all prompts', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      manager.register(createSuccessPlugin('plugin1', 'Plugin 1'));

      const prompts = [
        { path: 'prompt1.md', content: 'content1', functionName: 'func1', targetObjectPath: '/target1.o' },
        { path: 'prompt2.md', content: 'content2', functionName: 'func2', targetObjectPath: '/target2.o' },
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
        { path: 'prompt1.md', content: 'content1', functionName: 'func1', targetObjectPath: '/target1.o' },
        { path: 'prompt2.md', content: 'content2', functionName: 'func2', targetObjectPath: '/target2.o' },
        { path: 'prompt3.md', content: 'content3', functionName: 'func3', targetObjectPath: '/target3.o' },
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
        { path: 'prompt1.md', content: 'content1', functionName: 'func1', targetObjectPath: '/custom/target1.o' },
        { path: 'prompt2.md', content: 'content2', functionName: 'func2', targetObjectPath: '/custom/target2.o' },
      ]);

      expect(receivedTargets).toEqual(['/custom/target1.o', '/custom/target2.o']);
    });

    it('returns correct benchmark results structure', async () => {
      const manager = new PluginManager(defaultTestPipelineConfig);
      manager.register(createSuccessPlugin('plugin1', 'Plugin 1'));

      const results = await manager.runBenchmark([
        { path: 'prompt1.md', content: 'content1', functionName: 'func1', targetObjectPath: '/target.o' },
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
  });
});
