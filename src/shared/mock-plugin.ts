import type { PipelineContext, Plugin, PluginResult, PluginResultMap } from './types.js';

/**
 * Options for creating a mock plugin
 */
export interface MockPluginOptions {
  id: string;
  name: string;
  description?: string;
  executeResult?: Partial<PluginResult<any>>;
  executeFn?: (context: PipelineContext) => Promise<{ result: PluginResult<any>; context: PipelineContext }>;
  shouldRetryFn?: (result: PluginResult<any>) => boolean;
  prepareRetryFn?: (context: PipelineContext, previousAttempts: Array<Partial<PluginResultMap>>) => PipelineContext;
  contextUpdates?: Partial<PipelineContext>;
}

/**
 * Creates a mock plugin for testing
 */
export function createMockPlugin(options: MockPluginOptions): Plugin<any> {
  return {
    id: options.id,
    name: options.name,
    description: options.description || `Mock plugin: ${options.name}`,

    async execute(context: PipelineContext) {
      if (options.executeFn) {
        return options.executeFn(context);
      }

      const result: PluginResult<any> = {
        pluginId: options.id,
        pluginName: options.name,
        status: 'success',
        durationMs: 10,
        ...options.executeResult,
      };

      const newContext = {
        ...context,
        ...options.contextUpdates,
      };

      return { result, context: newContext };
    },

    prepareRetry(context: PipelineContext, previousAttempts: Array<Partial<PluginResultMap>>) {
      if (options.prepareRetryFn) {
        return options.prepareRetryFn(context, previousAttempts);
      }
      return context;
    },
  };
}

/**
 * Creates a plugin that always succeeds
 */
export function createSuccessPlugin(id: string, name: string, contextUpdates?: Partial<PipelineContext>): Plugin<any> {
  return createMockPlugin({
    id,
    name,
    executeResult: { status: 'success', output: `${name} succeeded` },
    contextUpdates,
  });
}

/**
 * Creates a plugin that always fails
 */
export function createFailurePlugin(id: string, name: string, error: string): Plugin<any> {
  return createMockPlugin({
    id,
    name,
    executeResult: { status: 'failure', error },
  });
}

/**
 * Creates a plugin that succeeds on the Nth attempt
 */
export function createSuccessOnAttemptPlugin(
  id: string,
  name: string,
  successOnAttempt: number,
  contextUpdates?: Partial<PipelineContext>,
): Plugin<any> {
  return createMockPlugin({
    id,
    name,
    executeFn: async (context) => {
      const isSuccess = context.attemptNumber >= successOnAttempt;

      const result: PluginResult<any> = {
        pluginId: id,
        pluginName: name,
        status: isSuccess ? 'success' : 'failure',
        durationMs: 10,
        output: isSuccess ? `${name} succeeded on attempt ${context.attemptNumber}` : undefined,
        error: isSuccess ? undefined : `${name} failed on attempt ${context.attemptNumber}`,
      };

      const newContext = isSuccess ? { ...context, ...contextUpdates } : context;

      return { result, context: newContext };
    },
  });
}
