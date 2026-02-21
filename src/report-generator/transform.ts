/**
 * Transform PipelineResults to BenchmarkReport format
 */
import type { AttemptResult, PipelineResults, PluginResult } from '~/shared/types.js';

import type {
  BenchmarkReport,
  ReportBackgroundTask,
  ReportMatchSource,
  ReportPluginResult,
  ReportPromptResult,
  ReportSection,
} from './types.js';

/**
 * Plugin configuration options for the report
 */
export interface ReportPluginConfigs {
  claudeRunner: {
    stallThreshold: number;
  };
  compiler: {
    compilerScript: string;
  };
}

/**
 * Transform PluginResult to ReportPluginResult
 */
function transformPluginResult(pluginResult: PluginResult<any>): ReportPluginResult {
  return {
    ...pluginResult,
    sections: (pluginResult.sections || []) as ReportSection[],
  };
}

function transformAttempt(attempt: AttemptResult) {
  return {
    ...attempt,
    pluginResults: attempt.pluginResults.map(transformPluginResult),
  };
}

/**
 * Transform PipelineResults to BenchmarkReport
 */
export function transformToReport(results: PipelineResults, pluginConfigs: ReportPluginConfigs): BenchmarkReport {
  const reportResults: ReportPromptResult[] = results.results.map((promptResult) => {
    const attempts = promptResult.attempts.map(transformAttempt);
    const setupFlow = transformAttempt(promptResult.setupFlow);
    const programmaticFlow = promptResult.programmaticFlow
      ? transformAttempt(promptResult.programmaticFlow)
      : undefined;

    const backgroundTasks: ReportBackgroundTask[] | undefined = promptResult.backgroundTasks;

    return {
      promptPath: promptResult.promptPath,
      functionName: promptResult.functionName,
      success: promptResult.success,
      attempts,
      totalDurationMs: promptResult.totalDurationMs,
      setupFlow,
      programmaticFlow,
      backgroundTasks: backgroundTasks?.length ? backgroundTasks : undefined,
      matchSource: promptResult.matchSource as ReportMatchSource | undefined,
    };
  });

  return {
    version: 1,
    timestamp: results.timestamp,
    config: {
      promptsDir: results.config.promptsDir,
      maxRetries: results.config.maxRetries,
      stallThreshold: pluginConfigs.claudeRunner.stallThreshold,
      compilerScript: pluginConfigs.compiler.compilerScript,
      getContextScript: results.config.getContextScript,
      target: results.config.target,
    },
    results: reportResults,
    summary: results.summary,
  };
}
