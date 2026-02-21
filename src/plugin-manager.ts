/**
 * Plugin Manager
 *
 * Orchestrates the execution of plugins in the benchmark pipeline.
 * Handles retry logic and context propagation between plugins.
 */
import type { BackgroundTaskCoordinator } from './shared/background-task-coordinator.js';
import { PipelineConfig } from './shared/config.js';
import { PipelineAbortError } from './shared/errors.js';
import type { PipelineEventHandler } from './shared/pipeline-events.js';
import type {
  AttemptResult,
  MatchSource,
  PipelineContext,
  PipelineResults,
  PipelineRunResult,
  Plugin,
  PluginResult,
  PluginResultMap,
} from './shared/types.js';

export class PluginManager {
  #setupFlowPlugins: Plugin<any>[] = [];
  #programmaticFlowPlugins: Plugin<any>[] = [];
  #plugins: Plugin<any>[] = [];
  #config: PipelineConfig;
  #eventHandler?: PipelineEventHandler;
  #backgroundCoordinator?: BackgroundTaskCoordinator;

  constructor(config: PipelineConfig, eventHandler?: PipelineEventHandler) {
    this.#config = config;
    this.#eventHandler = eventHandler;
  }

  /**
   * Set the background task coordinator for running background tasks during the AI-powered flow.
   */
  setBackgroundCoordinator(coordinator: BackgroundTaskCoordinator): void {
    this.#backgroundCoordinator = coordinator;
  }

  /**
   * Emit an event to the handler if one is registered
   */
  #emit(event: Parameters<PipelineEventHandler>[0]): void {
    this.#eventHandler?.(event);
  }

  /**
   * Register a plugin to the pipeline
   * Plugins are executed in the order they are registered
   */
  register(plugin: Plugin<any>): this {
    this.#plugins.push(plugin);
    this.#emit({
      type: 'plugin-registered',
      plugin: {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
      },
    });
    return this;
  }

  /**
   * Register plugins for the programmatic-flow phase.
   * These plugins run once before the retry loop. If they succeed, the pipeline
   * short-circuits without running the main retry loop.
   */
  registerProgrammaticFlow(...plugins: Plugin<any>[]): this {
    this.#programmaticFlowPlugins = plugins;
    for (const plugin of plugins) {
      this.#emit({
        type: 'plugin-registered',
        plugin: {
          id: plugin.id,
          name: plugin.name,
          description: plugin.description,
        },
      });
    }
    return this;
  }

  /**
   * Register plugins for the setup-flow phase.
   * These plugins run once per prompt before both programmatic-flow and AI-powered flow.
   * If a setup-flow plugin fails, the pipeline fails fatally for that prompt.
   */
  registerSetupFlow(...plugins: Plugin<any>[]): this {
    this.#setupFlowPlugins = plugins;
    for (const plugin of plugins) {
      this.#emit({
        type: 'plugin-registered',
        plugin: {
          id: plugin.id,
          name: plugin.name,
          description: plugin.description,
        },
      });
    }
    return this;
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): readonly Plugin<any>[] {
    return this.#plugins;
  }

  /**
   * Get all registered programmatic-flow plugins
   */
  getProgrammaticFlowPlugins(): readonly Plugin<any>[] {
    return this.#programmaticFlowPlugins;
  }

  /**
   * Get all registered setup-flow plugins
   */
  getSetupFlowPlugins(): readonly Plugin<any>[] {
    return this.#setupFlowPlugins;
  }

  /**
   * Run the pipeline for a single prompt
   */
  async runPipeline(
    promptPath: string,
    promptContent: string,
    functionName: string,
    targetObjectPath: string,
    asm: string,
  ): Promise<PipelineRunResult> {
    const startTime = Date.now();
    const attempts: AttemptResult[] = [];
    let success = false;

    // Initial context
    let context: PipelineContext = {
      promptPath,
      promptContent,
      functionName,
      asm,
      targetObjectPath,
      attemptNumber: 1,
      maxRetries: this.#config.maxRetries,
      previousAttempts: [],
      config: this.#config,
    };

    // setup-flow phase (e.g., get-context)
    this.#emit({ type: 'setup-flow-start' });

    const { finalContext: setupFlowContext, ...setupFlowResult } = await this.#runAttempt(
      context,
      this.#setupFlowPlugins,
    );

    const setupFlow: AttemptResult = setupFlowResult;

    if (!setupFlowResult.success) {
      // setup-flow failure is fatal — no retry
      return {
        promptPath,
        functionName,
        success: false,
        attempts: [],
        totalDurationMs: Date.now() - startTime,
        setupFlow,
      };
    }

    // Carry forward context from setup-flow
    context = { ...context, ...setupFlowContext };

    // Programmatic-flow phase
    let programmaticFlow: AttemptResult | undefined;
    if (this.#programmaticFlowPlugins.length > 0) {
      this.#emit({ type: 'programmatic-flow-start' });

      const { finalContext: preContext, ...preAttemptResult } = await this.#runAttempt(
        context,
        this.#programmaticFlowPlugins,
      );

      programmaticFlow = preAttemptResult;

      if (preAttemptResult.success) {
        return {
          promptPath,
          functionName,
          success: true,
          attempts: [],
          totalDurationMs: Date.now() - startTime,
          setupFlow,
          programmaticFlow,
          matchSource: 'programmatic-flow',
        };
      }

      // Carry forward m2cContext from the programmatic-flow
      context.m2cContext = preContext.m2cContext;

      // Enrich m2cContext with compiler/objdiff results from the programmatic-flow
      if (context.m2cContext) {
        const compilerResult = preAttemptResult.pluginResults.find((r) => r.pluginId === 'compiler');
        const objdiffResult = preAttemptResult.pluginResults.find((r) => r.pluginId === 'objdiff');

        if (compilerResult?.status === 'failure') {
          context.m2cContext.compilationError = compilerResult.output || compilerResult.error;
        } else if (objdiffResult) {
          context.m2cContext.objdiffOutput = objdiffResult.output || objdiffResult.error;
        }
      }

      // Reset generatedCode so Claude Runner generates fresh code
      context.generatedCode = undefined;
    }

    let matchSource: MatchSource | undefined;

    // Reset background plugin state for this prompt and wire fresh abort signal.
    // Listen for the 'success' event so we know when a background task finds a match.
    let backgroundMatchSource: string | null = null;
    const onBackgroundSuccess = (result: { pluginId: string }) => {
      backgroundMatchSource = result.pluginId;
    };
    if (this.#backgroundCoordinator) {
      this.#backgroundCoordinator.reset();
      this.#backgroundCoordinator.on('success', onBackgroundSuccess);
      const signal = this.#backgroundCoordinator.foregroundAbortSignal;
      for (const plugin of this.#plugins) {
        plugin.setForegroundAbortSignal?.(signal);
      }
    }

    for (let attempt = 1; attempt <= this.#config.maxRetries; attempt++) {
      // Check if a background task found a match between attempts
      if (backgroundMatchSource) {
        matchSource = backgroundMatchSource;
        success = true;
        break;
      }

      context.attemptNumber = attempt;

      this.#emit({
        type: 'attempt-start',
        attemptNumber: attempt,
        maxRetries: this.#config.maxRetries,
      });

      const { finalContext: attemptFinalContext, ...attemptResult } = await this.#runAttempt(context);
      attempts.push(attemptResult);

      const willRetry = !attemptResult.success && attempt < this.#config.maxRetries;

      // Extract differenceCount from objdiff result for the attempt-complete event
      const objdiffResult = attemptResult.pluginResults.find((r) => r.pluginId === 'objdiff');
      const differenceCount = (objdiffResult?.data as { differenceCount?: number } | undefined)?.differenceCount;

      this.#emit({
        type: 'attempt-complete',
        attemptNumber: attempt,
        success: attemptResult.success,
        willRetry,
        differenceCount,
      });

      if (attemptResult.success) {
        success = true;
        matchSource = 'claude';
        break;
      }

      // Let background plugins decide whether to spawn
      this.#backgroundCoordinator?.onAttemptComplete({
        attemptNumber: attempt,
        willRetry,
        context: attemptFinalContext,
        attemptResults: attemptResult.pluginResults,
      });

      // Prepare for retry if needed
      if (willRetry) {
        // Store this attempt's results as an object mapping plugin IDs to their results
        context.previousAttempts = context.previousAttempts || [];
        const attemptResultsMap = this.#transformResultsToMap(attemptResult.pluginResults);
        context.previousAttempts.push(attemptResultsMap);

        // Allow plugins to prepare context for retry
        context = this.#prepareRetryContext(context);
      }
    }

    // Cancel remaining background tasks and collect results.
    // A task may succeed during cancelAll (its .then() fires before the promise settles),
    // so we check backgroundMatchSource one final time after awaiting.
    await this.#backgroundCoordinator?.cancelAll();
    this.#backgroundCoordinator?.removeListener('success', onBackgroundSuccess);
    const backgroundTasks = this.#backgroundCoordinator?.getAllResults();

    if (!success && backgroundMatchSource) {
      matchSource = backgroundMatchSource;
      success = true;
    }

    return {
      promptPath,
      functionName,
      success,
      attempts,
      totalDurationMs: Date.now() - startTime,
      setupFlow,
      programmaticFlow,
      backgroundTasks: backgroundTasks?.length ? backgroundTasks : undefined,
      matchSource,
    };
  }

  /**
   * Run a single attempt through all plugins
   */
  async #runAttempt(
    context: PipelineContext,
    plugins?: Plugin<any>[],
  ): Promise<AttemptResult & { finalContext: PipelineContext }> {
    const startTimestamp = new Date().toISOString();
    const startTime = Date.now();
    const pluginResults: PluginResult<any>[] = [];
    let currentContext = { ...context };
    let success = true;
    let shouldStop = false;

    for (const plugin of plugins || this.#plugins) {
      if (shouldStop) {
        // Skip remaining plugins
        pluginResults.push({
          pluginId: plugin.id,
          pluginName: plugin.name,
          status: 'skipped',
          durationMs: 0,
          output: 'Skipped due to previous plugin failure',
        });

        this.#emit({
          type: 'plugin-execution-complete',
          pluginId: plugin.id,
          pluginName: plugin.name,
          status: 'skipped',
          durationMs: 0,
        });
        continue;
      }

      this.#emit({
        type: 'plugin-execution-start',
        pluginId: plugin.id,
        pluginName: plugin.name,
      });

      const pluginStartTime = Date.now();

      try {
        const { result, context: updatedContext } = await plugin.execute(currentContext);

        // Generate report sections if the plugin supports it
        if (plugin.getReportSections) {
          result.sections = plugin.getReportSections(result, updatedContext);
        }

        pluginResults.push(result);
        currentContext = updatedContext;

        this.#emit({
          type: 'plugin-execution-complete',
          pluginId: plugin.id,
          pluginName: plugin.name,
          status: result.status,
          error: result.error,
          durationMs: result.durationMs,
        });

        if (result.status === 'failure') {
          success = false;
          shouldStop = true;
        }
      } catch (error) {
        // PipelineAbortError must propagate immediately for graceful shutdown
        if (error instanceof PipelineAbortError) {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        const durationMs = Date.now() - pluginStartTime;

        pluginResults.push({
          pluginId: plugin.id,
          pluginName: plugin.name,
          status: 'failure',
          durationMs,
          error: `Unexpected error: ${errorMessage}`,
        });

        this.#emit({
          type: 'plugin-execution-complete',
          pluginId: plugin.id,
          pluginName: plugin.name,
          status: 'failure',
          error: `Unexpected error: ${errorMessage}`,
          durationMs,
        });

        success = false;
        shouldStop = true;
      }
    }

    return {
      attemptNumber: context.attemptNumber,
      pluginResults,
      success,
      durationMs: Date.now() - startTime,
      startTimestamp,
      finalContext: currentContext,
    };
  }

  /**
   * Transform an array of plugin results into an object mapping plugin IDs to their results
   */
  #transformResultsToMap(results: PluginResult<any>[]): Partial<PluginResultMap> {
    const resultsMap: Partial<PluginResultMap> = {};

    for (const result of results) {
      // Only include non-skipped plugins in the map
      if (result.status !== 'skipped') {
        (resultsMap as Record<string, PluginResult<any>>)[result.pluginId] = result;
      }
    }

    return resultsMap;
  }

  /**
   * Prepare context for retry by calling each plugin's prepareRetry if available
   */
  #prepareRetryContext(context: PipelineContext): PipelineContext {
    let updatedContext = { ...context };

    for (const plugin of this.#plugins) {
      if (plugin.prepareRetry) {
        updatedContext = plugin.prepareRetry(updatedContext, context.previousAttempts || []);
      }
    }

    return updatedContext;
  }

  /**
   * Run the full benchmark for all prompts
   */
  async runBenchmark(
    prompts: Array<{ path: string; content: string; functionName: string; targetObjectPath: string; asm: string }>,
  ): Promise<PipelineResults> {
    // Emit benchmark start event
    this.#emit({
      type: 'benchmark-start',
      config: this.#config,
      plugins: this.#plugins.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      })),
      promptCount: prompts.length,
    });

    const results: PipelineRunResult[] = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];

      this.#emit({
        type: 'prompt-start',
        promptPath: prompt.path,
        functionName: prompt.functionName,
        targetObjectPath: prompt.targetObjectPath,
        promptIndex: i,
        totalPrompts: prompts.length,
      });

      try {
        const result = await this.runPipeline(
          prompt.path,
          prompt.content,
          prompt.functionName,
          prompt.targetObjectPath,
          prompt.asm,
        );

        this.#emit({
          type: 'prompt-complete',
          promptPath: prompt.path,
          functionName: prompt.functionName,
          success: result.success,
          attemptsUsed: result.attempts.length,
          durationMs: result.totalDurationMs,
        });

        results.push(result);
      } catch (error) {
        if (error instanceof PipelineAbortError) {
          // Pipeline is aborted — stop processing and return partial results
          this.#emit({
            type: 'prompt-complete',
            promptPath: prompt.path,
            functionName: prompt.functionName,
            success: false,
            attemptsUsed: 0,
            durationMs: 0,
          });
          break;
        }

        // Unexpected error — record as failed result and continue with next prompt
        // TODO: The error is saved in the setup flow, although it could have happened in any plugin.
        //       We may want to enhance this later to capture more details about where the error occurred.
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          promptPath: prompt.path,
          functionName: prompt.functionName,
          success: false,
          attempts: [],
          totalDurationMs: 0,
          setupFlow: {
            attemptNumber: 0,
            pluginResults: [
              {
                pluginId: 'pipeline',
                pluginName: 'Pipeline',
                status: 'failure',
                durationMs: 0,
                error: `Unexpected error during one of the plugin executions:\n\n${errorMessage}`,
              },
            ],
            success: false,
            startTimestamp: new Date().toISOString(),
            durationMs: 0,
          },
        });

        this.#emit({
          type: 'prompt-complete',
          promptPath: prompt.path,
          functionName: prompt.functionName,
          success: false,
          attemptsUsed: 0,
          durationMs: 0,
        });
      }
    }

    // Calculate summary
    const summary = this.#calculateSummary(results);

    // Emit benchmark complete event
    this.#emit({
      type: 'benchmark-complete',
      summary,
    });

    return {
      timestamp: new Date().toISOString(),
      config: this.#config,
      results,
      summary,
    };
  }

  /**
   * Calculate summary statistics
   */
  #calculateSummary(results: PipelineRunResult[]) {
    const totalPrompts = results.length;
    const successfulPrompts = results.filter((r) => r.success).length;
    const successRate = totalPrompts > 0 ? (successfulPrompts / totalPrompts) * 100 : 0;

    const avgAttempts =
      results.length > 0 ? results.reduce((sum, r) => sum + r.attempts.length, 0) / results.length : 0;

    const totalDurationMs = results.reduce((sum, r) => sum + r.totalDurationMs, 0);

    return {
      totalPrompts,
      successfulPrompts,
      successRate,
      avgAttempts,
      totalDurationMs,
    };
  }
}
