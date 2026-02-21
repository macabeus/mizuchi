/**
 * Background Task Coordinator
 *
 * Manages background tasks that run concurrently with the AI-powered flow.
 * Accepts plugins with background capabilities, asks them when to spawn,
 * and tracks results. Plugin-agnostic — the spawn decision and execution
 * logic live in each plugin's BackgroundCapability.
 *
 * Also owns the foreground abort signal: when a background task succeeds,
 * the signal fires so foreground plugins (e.g., Claude) can stop early.
 * The signal is refreshed on reset() so each prompt gets a clean slate.
 */
import { EventEmitter } from 'events';

import type { PipelineEventHandler } from './pipeline-events.js';
import type { BackgroundCapability, BackgroundSpawnContext, BackgroundTaskResult, Plugin } from './types.js';

interface ActiveTask {
  promise: Promise<BackgroundTaskResult>;
  abortController: AbortController;
}

/**
 * A plugin that has a background capability (non-optional).
 */
export type BackgroundPlugin = Plugin<any> & { background: BackgroundCapability<any, any> };

/**
 * Coordinates background tasks running alongside the AI-powered flow.
 *
 * Emits:
 * - `'success'` (BackgroundTaskResult) — when a background task finds a match.
 *   The foreground abort signal also fires so long-running plugins (e.g., Claude)
 *   can stop early. Listeners should treat this as the definitive notification
 *   that background work has found a match.
 *
 * Usage:
 * 1. Create coordinator with plugins that have background capabilities
 * 2. Listen for `'success'` to react when a background task finds a match
 * 3. Call onAttemptComplete() after each attempt
 * 4. Call cancelAll() when pipeline ends
 */
export class BackgroundTaskCoordinator extends EventEmitter {
  #plugins: BackgroundPlugin[];
  #tasks: Map<string, ActiveTask> = new Map();
  #results: BackgroundTaskResult[] = [];
  #successResult: BackgroundTaskResult | null = null;
  #nextTaskId = 1;
  #eventHandler?: PipelineEventHandler;
  #foregroundAbortController = new AbortController();

  constructor(plugins: BackgroundPlugin[], eventHandler?: PipelineEventHandler) {
    super();
    this.#plugins = plugins;
    this.#eventHandler = eventHandler;
  }

  /**
   * Abort signal that fires when a background task succeeds.
   * Refreshed on each reset() call so each prompt gets a clean signal.
   */
  get foregroundAbortSignal(): AbortSignal {
    return this.#foregroundAbortController.signal;
  }

  /**
   * Called after each attempt. Asks each background plugin if it wants to spawn.
   */
  onAttemptComplete(spawnContext: BackgroundSpawnContext): void {
    for (const plugin of this.#plugins) {
      const config = plugin.background.shouldSpawn(spawnContext);
      if (config !== null) {
        this.#spawn(plugin, config, spawnContext.attemptNumber);
      }
    }
  }

  /**
   * Reset all background plugins' state (call between prompts).
   * Creates a fresh foreground abort signal.
   */
  reset(): void {
    for (const plugin of this.#plugins) {
      plugin.background.reset?.();
    }
    this.#results = [];
    this.#successResult = null;
    this.#nextTaskId = 1;
    this.#foregroundAbortController = new AbortController();
  }

  #spawn(plugin: BackgroundPlugin, config: unknown, triggeredByAttempt: number): void {
    const taskId = `${plugin.id}-${this.#nextTaskId++}`;
    const startTimestamp = new Date().toISOString();
    const startTime = Date.now();
    const abortController = new AbortController();

    this.#eventHandler?.({
      type: 'background-task-start',
      taskId,
      triggeredByAttempt,
    });

    const promise = plugin.background
      .run(config, abortController.signal)
      .then((pluginResult: unknown): BackgroundTaskResult => {
        const result = plugin.background.toBackgroundTaskResult(pluginResult, {
          taskId,
          durationMs: Date.now() - startTime,
          triggeredByAttempt,
          startTimestamp,
        });

        this.#results.push(result);
        this.#tasks.delete(taskId);

        this.#eventHandler?.({
          type: 'background-task-complete',
          taskId,
          success: result.success,
          durationMs: result.durationMs,
        });

        if (plugin.background.isSuccess(pluginResult) && !this.#successResult) {
          this.#successResult = result;
          this.#foregroundAbortController.abort();
          this.emit('success', result);
        }

        return result;
      })
      .catch((error): BackgroundTaskResult => {
        const result: BackgroundTaskResult = {
          taskId,
          pluginId: plugin.id,
          success: false,
          durationMs: Date.now() - startTime,
          triggeredByAttempt,
          startTimestamp,
          data: { error: error instanceof Error ? error.message : String(error) },
        };

        this.#results.push(result);
        this.#tasks.delete(taskId);

        this.#eventHandler?.({
          type: 'background-task-complete',
          taskId,
          success: false,
          durationMs: result.durationMs,
        });

        return result;
      });

    this.#tasks.set(taskId, { promise, abortController });
  }

  /**
   * Cancel all running background tasks.
   * Waits for tasks to clean up.
   */
  async cancelAll(): Promise<void> {
    for (const [, task] of this.#tasks) {
      task.abortController.abort();
    }

    await Promise.allSettled(Array.from(this.#tasks.values()).map((t) => t.promise));

    this.#tasks.clear();
  }

  /**
   * Get all completed background task results.
   */
  getAllResults(): BackgroundTaskResult[] {
    return [...this.#results];
  }

  /**
   * Get the number of currently running background tasks.
   */
  getActiveTaskCount(): number {
    return this.#tasks.size;
  }
}
