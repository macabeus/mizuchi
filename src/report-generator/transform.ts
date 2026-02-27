/**
 * Transform PipelineResults to RunReport format
 */
import type { AttemptResult, PipelineResults, PluginResult } from '~/shared/types.js';

import type {
  ReportBackgroundTask,
  ReportMatchSource,
  ReportPluginResult,
  ReportPromptResult,
  ReportSection,
  RunReport,
} from './types.js';

/**
 * Plugin configuration options for the report
 */
export interface ReportPluginConfigs {
  claudeRunner: {
    stallThreshold: number;
    model: string;
    softTimeout?: {
      softTimeoutMs: number;
      prompt: string;
      model?: string;
      effort?: string;
    };
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
 * Transform PipelineResults to RunReport
 */
export function transformToReport(results: PipelineResults, pluginConfigs: ReportPluginConfigs): RunReport {
  const reportResults: ReportPromptResult[] = results.results.map((promptResult) => {
    const attempts = promptResult.attempts.map(transformAttempt);
    const setupPhase = transformAttempt(promptResult.setupPhase);
    const programmaticPhase = promptResult.programmaticPhase
      ? transformAttempt(promptResult.programmaticPhase)
      : undefined;

    const backgroundTasks: ReportBackgroundTask[] | undefined = promptResult.backgroundTasks;

    return {
      promptPath: promptResult.promptPath,
      functionName: promptResult.functionName,
      success: promptResult.success,
      attempts,
      totalDurationMs: promptResult.totalDurationMs,
      setupPhase,
      programmaticPhase,
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
      model: pluginConfigs.claudeRunner.model,
      softTimeout: pluginConfigs.claudeRunner.softTimeout,
    },
    results: reportResults,
    summary: results.summary,
  };
}
