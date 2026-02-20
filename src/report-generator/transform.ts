/**
 * Transform PipelineResults to BenchmarkReport format
 */
import type { DecompPermuterResult } from '~/shared/decomp-permuter.js';
import type { PipelineResults, PluginResult } from '~/shared/types.js';

import type {
  BenchmarkReport,
  ReportAttempt,
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
      startTimestamp: attempt.startTimestamp,
    }));

    const setupFlow = {
      attemptNumber: promptResult.setupFlow.attemptNumber,
      success: promptResult.setupFlow.success,
      durationMs: promptResult.setupFlow.durationMs,
      pluginResults: promptResult.setupFlow.pluginResults.map(transformPluginResult),
      startTimestamp: promptResult.setupFlow.startTimestamp,
    };

    const programmaticFlow = promptResult.programmaticFlow
      ? {
          attemptNumber: promptResult.programmaticFlow.attemptNumber,
          success: promptResult.programmaticFlow.success,
          durationMs: promptResult.programmaticFlow.durationMs,
          pluginResults: promptResult.programmaticFlow.pluginResults.map(transformPluginResult),
          startTimestamp: promptResult.programmaticFlow.startTimestamp,
        }
      : undefined;

    const backgroundTasks: ReportBackgroundTask[] | undefined = promptResult.backgroundTasks?.map((bt) => {
      const data = bt.data as DecompPermuterResult;
      return {
        taskId: bt.taskId,
        success: bt.success,
        bestScore: data.bestScore,
        baseScore: data.baseScore,
        bestCode: data.bestCode,
        bestDiff: data.bestDiff,
        iterationsRun: data.iterationsRun,
        durationMs: bt.durationMs,
        triggeredByAttempt: bt.triggeredByAttempt,
        startTimestamp: bt.startTimestamp,
        stdout: data.stdout,
        stderr: data.stderr,
      };
    });

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
