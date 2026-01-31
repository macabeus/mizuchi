/**
 * Transform PipelineResults to BenchmarkReport format
 */
import type { PipelineResults, PluginResult } from '~/shared/types.js';

import type { BenchmarkReport, ReportAttempt, ReportPluginResult, ReportPromptResult, ReportSection } from './types.js';

/**
 * Plugin configuration options for the report
 */
export interface ReportPluginConfigs {
  claudeRunner: {
    systemPrompt: string;
  };
  compiler: {
    flags: string;
  };
}

/**
 * Transform PluginResult to ReportPluginResult
 */
function transformPluginResult(pluginResult: PluginResult<any>): ReportPluginResult {
  return {
    pluginId: pluginResult.pluginId,
    pluginName: pluginResult.pluginName,
    status: pluginResult.status,
    durationMs: pluginResult.durationMs,
    error: pluginResult.error,
    output: pluginResult.output,
    data: pluginResult.data,
    sections: (pluginResult.sections || []) as ReportSection[],
  };
}

/**
 * Transform PipelineResults to BenchmarkReport
 */
export function transformToReport(results: PipelineResults, pluginConfigs: ReportPluginConfigs): BenchmarkReport {
  const reportResults: ReportPromptResult[] = results.results.map((promptResult) => {
    const attempts: ReportAttempt[] = promptResult.attempts.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      success: attempt.success,
      durationMs: attempt.durationMs,
      pluginResults: attempt.pluginResults.map(transformPluginResult),
    }));

    return {
      promptPath: promptResult.promptPath,
      functionName: promptResult.functionName,
      success: promptResult.success,
      attempts,
      totalDurationMs: promptResult.totalDurationMs,
    };
  });

  return {
    version: 1,
    timestamp: results.timestamp,
    config: {
      promptsDir: results.config.promptsDir,
      maxRetries: results.config.maxRetries,
      claudeSystemPrompt: pluginConfigs.claudeRunner.systemPrompt,
      compilerFlags: results.config.compilerFlags,
    },
    results: reportResults,
    summary: results.summary,
  };
}
