import type { ClaudeRunnerResult } from '~/plugins/claude-runner/claude-runner-plugin.js';
import type { CompilerResult } from '~/plugins/compiler/compiler-plugin.js';
import type { GetContextResult } from '~/plugins/get-context/get-context-plugin.js';
import type { M2cPluginResult } from '~/plugins/m2c/m2c-plugin.js';
import type { ObjdiffResult } from '~/plugins/objdiff/objdiff-plugin.js';

import { AttemptResult, PluginResult } from './types';

/**
 * Mapping of plugin IDs to their raw result data types (without PluginResult wrapper)
 * Used by getPluginResult to provide type-safe access to plugin results
 */
type PluginResultDataMap = {
  'claude-runner': ClaudeRunnerResult;
  compiler: CompilerResult;
  'get-context': GetContextResult;
  m2c: M2cPluginResult;
  objdiff: ObjdiffResult;
};

/**
 * Get PluginResult by pluginId from a given attempt.
 */
export function getPluginResult<TPluginId extends keyof PluginResultDataMap>(
  attempt: AttemptResult,
  pluginId: TPluginId,
): PluginResult<PluginResultDataMap[TPluginId]> | undefined;
export function getPluginResult<T>(attempt: AttemptResult, pluginId: string): PluginResult<T> | undefined;
export function getPluginResult(attempt: AttemptResult, pluginId: string): PluginResult<unknown> | undefined {
  return attempt.pluginResults.find((p) => p.pluginId === pluginId);
}
