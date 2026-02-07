import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { option } from 'pastel';
import path from 'path';
import React, { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

import {
  buildPipelineConfig,
  getConfigFilePath,
  getPluginConfigFromFile,
  loadConfigFile,
  validatePaths,
} from '~/cli/config.js';
import { PluginManager } from '~/plugin-manager.js';
import {
  ClaudeRunnerConfig,
  ClaudeRunnerPlugin,
  claudeRunnerConfigSchema,
} from '~/plugins/claude-runner/claude-runner-plugin.js';
import { CompilerConfig, CompilerPlugin, compilerConfigSchema } from '~/plugins/compiler/compiler-plugin.js';
import { ObjdiffPlugin } from '~/plugins/objdiff/objdiff-plugin.js';
import { loadPrompts } from '~/prompt-loader.js';
import {
  type ReportPluginConfigs,
  generateHtmlReport,
  saveJsonReport,
  transformToReport,
} from '~/report-generator/index.js';
import { PipelineConfig } from '~/shared/config';
import type { PipelineEvent, PluginInfo } from '~/shared/pipeline-events.js';
import type { PipelineResults } from '~/shared/types.js';

export const options = z.object({
  config: z
    .string()
    .optional()
    .describe(option({ description: 'Path to mizuchi.yaml config file', alias: 'c' })),
  prompts: z
    .string()
    .optional()
    .describe(option({ description: 'Directory containing prompt folders', alias: 'p' })),
  retries: z
    .number()
    .optional()
    .describe(option({ description: 'Maximum retry attempts per prompt', alias: 'r' })),
  output: z
    .string()
    .optional()
    .describe(option({ description: 'Output directory for generated files and report', alias: 'o' })),
});

type Props = {
  options: z.infer<typeof options>;
};

/**
 * Plugin execution status for display
 */
interface PluginStatus {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
  error?: string;
  durationMs?: number;
}

/**
 * Current progress state for UI rendering
 */
interface ProgressState {
  phase: 'loading' | 'initializing' | 'running' | 'complete' | 'error';
  config?: PipelineConfig;
  plugins: PluginInfo[];
  // Current prompt info
  currentPrompt?: {
    path: string;
    functionName: string;
    targetObjectPath: string;
    index: number;
    total: number;
  };
  // Current attempt info
  currentAttempt?: {
    number: number;
    maxRetries: number;
  };
  // Plugin execution status for current attempt
  pluginStatuses: PluginStatus[];
  // Completed prompts summary
  completedPrompts: Array<{
    path: string;
    functionName: string;
    success: boolean;
    attemptsUsed: number;
  }>;
  // Final results
  results?: PipelineResults;
  htmlReportPath?: string;
  // Error message
  errorMessage?: string;
}

export default function Index({ options: opts }: Props) {
  const [state, setState] = useState<ProgressState>({
    phase: 'loading',
    plugins: [],
    pluginStatuses: [],
    completedPrompts: [],
  });

  const handleEvent = useCallback((event: PipelineEvent) => {
    setState((prev) => {
      switch (event.type) {
        case 'benchmark-start':
          return {
            ...prev,
            phase: 'running',
            config: event.config,
            plugins: event.plugins,
          };

        case 'plugin-registered':
          return {
            ...prev,
            plugins: [...prev.plugins, event.plugin],
          };

        case 'prompt-start':
          return {
            ...prev,
            currentPrompt: {
              path: event.promptPath,
              functionName: event.functionName,
              targetObjectPath: event.targetObjectPath,
              index: event.promptIndex,
              total: event.totalPrompts,
            },
            pluginStatuses: prev.plugins.map((p) => ({
              id: p.id,
              name: p.name,
              status: 'pending' as const,
            })),
          };

        case 'attempt-start':
          return {
            ...prev,
            currentAttempt: {
              number: event.attemptNumber,
              maxRetries: event.maxRetries,
            },
            // Reset plugin statuses for new attempt
            pluginStatuses: prev.plugins.map((p) => ({
              id: p.id,
              name: p.name,
              status: 'pending' as const,
            })),
          };

        case 'plugin-execution-start':
          return {
            ...prev,
            pluginStatuses: prev.pluginStatuses.map((p) =>
              p.id === event.pluginId ? { ...p, status: 'running' as const } : p,
            ),
          };

        case 'plugin-execution-complete':
          return {
            ...prev,
            pluginStatuses: prev.pluginStatuses.map((p) =>
              p.id === event.pluginId
                ? {
                    ...p,
                    status: event.status as 'success' | 'failure' | 'skipped',
                    error: event.error,
                    durationMs: event.durationMs,
                  }
                : p,
            ),
          };

        case 'prompt-complete':
          return {
            ...prev,
            completedPrompts: [
              ...prev.completedPrompts,
              {
                path: event.promptPath,
                functionName: event.functionName,
                success: event.success,
                attemptsUsed: event.attemptsUsed,
              },
            ],
          };

        case 'benchmark-complete':
          return {
            ...prev,
            phase: 'complete',
          };

        default:
          return prev;
      }
    });
  }, []);

  useEffect(() => {
    runPipeline(opts, handleEvent, setState);
  }, [opts, handleEvent]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          Mizuchi - Decompilation Pipeline Runner
        </Text>
      </Box>

      {/* Loading phase */}
      {state.phase === 'loading' && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" /> Loading configuration...
          </Text>
        </Box>
      )}

      {/* Initializing phase */}
      {state.phase === 'initializing' && (
        <Box flexDirection="column">
          <Text color="yellow">
            <Spinner type="dots" /> Initializing plugins...
          </Text>
          {state.plugins.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              {state.plugins.map((plugin) => (
                <Text key={plugin.id} dimColor>
                  {' '}
                  + {plugin.name}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Running phase */}
      {state.phase === 'running' && (
        <Box flexDirection="column">
          {/* Config info */}
          {state.config && (
            <Box marginBottom={1} flexDirection="column">
              <Text dimColor>Prompts: {state.config.promptsDir}</Text>
              <Text dimColor>Max retries: {state.config.maxRetries}</Text>
            </Box>
          )}

          {/* Current prompt */}
          {state.currentPrompt && (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>
                [{state.currentPrompt.index + 1}/{state.currentPrompt.total}] {state.currentPrompt.path}
              </Text>
              <Text dimColor> Function: {state.currentPrompt.functionName}</Text>
            </Box>
          )}

          {/* Current attempt */}
          {state.currentAttempt && (
            <Box marginBottom={1}>
              <Text>
                Attempt {state.currentAttempt.number}/{state.currentAttempt.maxRetries}
              </Text>
            </Box>
          )}

          {/* Plugin statuses */}
          <Box flexDirection="column" marginLeft={2}>
            {state.pluginStatuses.map((plugin) => (
              <PluginStatusLine key={plugin.id} plugin={plugin} />
            ))}
          </Box>

          {/* Completed prompts summary */}
          {state.completedPrompts.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>
                Completed: {state.completedPrompts.filter((p) => p.success).length} succeeded,{' '}
                {state.completedPrompts.filter((p) => !p.success).length} failed
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Complete phase */}
      {state.phase === 'complete' && state.results && (
        <PipelineSummary results={state.results} htmlReportPath={state.htmlReportPath} />
      )}

      {/* Error phase */}
      {state.phase === 'error' && (
        <Box flexDirection="column">
          <Text color="red" bold>
            Error
          </Text>
          <Text color="red">{state.errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Renders a single plugin's status
 */
function PluginStatusLine({ plugin }: { plugin: PluginStatus }) {
  const getStatusIcon = () => {
    switch (plugin.status) {
      case 'pending':
        return <Text dimColor>-</Text>;
      case 'running':
        return (
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
        );
      case 'success':
        return <Text color="green">+</Text>;
      case 'failure':
        return <Text color="red">x</Text>;
      case 'skipped':
        return <Text dimColor>-</Text>;
    }
  };

  const getStatusColor = (): string | undefined => {
    switch (plugin.status) {
      case 'pending':
        return undefined;
      case 'running':
        return 'yellow';
      case 'success':
        return 'green';
      case 'failure':
        return 'red';
      case 'skipped':
        return undefined;
    }
  };

  return (
    <Box>
      {getStatusIcon()}
      <Text color={getStatusColor()} dimColor={plugin.status === 'pending' || plugin.status === 'skipped'}>
        {' '}
        [{plugin.id}]{' '}
        {plugin.status === 'running'
          ? 'Running...'
          : plugin.status === 'failure'
            ? plugin.error || 'Failed'
            : plugin.status === 'skipped'
              ? 'Skipped'
              : plugin.status === 'success'
                ? `Done (${plugin.durationMs}ms)`
                : ''}
      </Text>
    </Box>
  );
}

/**
 * Renders the final summary
 */
function PipelineSummary({ results, htmlReportPath }: { results: PipelineResults; htmlReportPath?: string }) {
  const { summary } = results;
  const successColor = summary.successRate === 100 ? 'green' : summary.successRate >= 50 ? 'yellow' : 'red';

  return (
    <Box flexDirection="column">
      <Text color="green" bold>
        Pipeline Complete
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          Total Prompts: <Text bold>{summary.totalPrompts}</Text>
        </Text>

        <Text>
          Successful:{' '}
          <Text bold color="green">
            {summary.successfulPrompts}
          </Text>
        </Text>

        <Text>
          Success Rate:{' '}
          <Text bold color={successColor}>
            {summary.successRate.toFixed(1)}%
          </Text>
        </Text>

        <Text>
          Avg Attempts: <Text bold>{summary.avgAttempts.toFixed(1)}</Text>
        </Text>

        <Text>
          Total Duration: <Text bold>{(summary.totalDurationMs / 1000).toFixed(1)}s</Text>
        </Text>
      </Box>

      {/* Individual prompt results */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Results:</Text>

        {results.results.map((result) => (
          <Box key={result.promptPath} marginLeft={1}>
            <Text color={result.success ? 'green' : 'red'}>
              {result.success ? '+' : 'x'} {result.functionName}
            </Text>
            <Text dimColor>
              {' '}
              ({result.attempts.length} attempt{result.attempts.length > 1 ? 's' : ''})
            </Text>
          </Box>
        ))}

        <Box marginTop={1}>
          <Text dimColor>See the detailed report at: {path.resolve(htmlReportPath || '')}</Text>
        </Box>
      </Box>
    </Box>
  );
}

async function runPipeline(
  opts: z.infer<typeof options>,
  onEvent: (event: PipelineEvent) => void,
  setState: React.Dispatch<React.SetStateAction<ProgressState>>,
): Promise<void> {
  try {
    // Load configuration from file (if exists)
    const configPath = getConfigFilePath(opts.config);
    const fileConfig = await loadConfigFile(configPath);

    if (!fileConfig) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: `Configuration file not found: ${configPath}`,
      }));

      setTimeout(() => {
        process.exit(1);
      }, 1);

      return;
    }

    // Build configuration with CLI overrides
    const pipelineConfig = buildPipelineConfig(fileConfig, {
      prompts: opts.prompts,
      retries: opts.retries,
      output: opts.output,
    });

    const { errors: pathErrors } = await validatePaths(pipelineConfig);
    if (pathErrors.length > 0) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: pathErrors.join('\n'),
      }));

      setTimeout(() => {
        process.exit(1);
      }, 1);

      return;
    }

    // Load prompts
    const { prompts, errors: loadPromptErrors } = await loadPrompts(pipelineConfig.promptsDir);
    if (loadPromptErrors.length > 0) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: loadPromptErrors.map((e) => e.message).join('\n'),
      }));

      setTimeout(() => {
        process.exit(1);
      }, 1);

      return;
    }
    if (prompts.length === 0) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: 'No valid prompt files found in the specified directory.',
      }));

      setTimeout(() => {
        process.exit(1);
      }, 1);

      return;
    }

    setState((prev) => ({ ...prev, phase: 'initializing' }));

    // Create plugin manager with event handler
    const manager = new PluginManager(pipelineConfig, onEvent);

    // Get plugin configurations
    const claudeRunnerConfig: ClaudeRunnerConfig = getPluginConfigFromFile<ClaudeRunnerConfig>(
      fileConfig,
      'claude-runner',
      claudeRunnerConfigSchema,
    );

    const compilerConfig: CompilerConfig = getPluginConfigFromFile<CompilerConfig>(
      fileConfig,
      'compiler',
      compilerConfigSchema,
    );

    // Create plugins with their configurations
    const claudePlugin = new ClaudeRunnerPlugin(claudeRunnerConfig, pipelineConfig);
    const compilerPlugin = new CompilerPlugin(compilerConfig, pipelineConfig);

    manager.register(claudePlugin).register(compilerPlugin).register(new ObjdiffPlugin());

    const results = await manager.runBenchmark(prompts);

    // Save cache after benchmark completes
    await claudePlugin.saveCache();

    await compilerPlugin.cleanup();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const htmlPath = path.join(pipelineConfig.outputDir, `benchmark-report-${timestamp}.html`);
    const jsonPath = path.join(pipelineConfig.outputDir, `benchmark-results-${timestamp}.json`);

    // Transform results to report format
    const pluginConfigs: ReportPluginConfigs = {
      claudeRunner: {
        systemPrompt: claudePlugin.systemPrompt,
        stallThreshold: claudeRunnerConfig.stallThreshold,
      },
      compiler: {
        flags: compilerConfig.flags,
      },
    };
    const report = transformToReport(results, pluginConfigs);

    // Save reports sequentially to ensure both complete even if one fails
    try {
      await saveJsonReport(report, jsonPath);
    } catch {
      // Silently handle JSON report errors
    }

    try {
      await generateHtmlReport(report, htmlPath);
    } catch {
      // Silently handle HTML report errors
    }

    setState((prev) => ({ ...prev, phase: 'complete', results, htmlReportPath: htmlPath }));

    setTimeout(() => {
      const exitCode = results.summary.successRate === 100 ? 0 : 1;
      process.exit(exitCode);
    }, 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState((prev) => ({ ...prev, phase: 'error', errorMessage: message }));

    setTimeout(() => {
      process.exit(1);
    }, 1);
  }
}
