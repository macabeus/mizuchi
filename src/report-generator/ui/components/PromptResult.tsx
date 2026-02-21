import { useState } from 'react';

import type {
  ReportBackgroundTask,
  ReportPermuterBackgroundTask,
  ReportPluginResult,
  ReportPromptResult,
  ReportSection,
} from '../../types';
import { AttemptContent } from './AttemptContent';
import { AttemptsChart } from './AttemptsChart';
import { BestResultCode } from './BestResultCode';
import { Icon } from './Icon';
import { PluginDetails } from './PluginDetails';
import { SideMenu } from './SideMenu';
import { Tabs } from './Tabs';
import { TimelineChart } from './TimelineChart';

interface PromptResultProps {
  result: ReportPromptResult;
  isExpanded: boolean;
  onToggle: () => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function PromptResult({ result, isExpanded, onToggle }: PromptResultProps) {
  const promptName = result.promptPath.split('/').pop() || result.promptPath;

  return (
    <div className="bg-slate-800 rounded-xl shadow-lg overflow-hidden border border-slate-700">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              result.success
                ? 'bg-gradient-to-r from-emerald-400 to-green-500 shadow-lg shadow-emerald-500/30'
                : 'bg-gradient-to-r from-red-400 to-rose-500 shadow-lg shadow-red-500/30'
            }`}
          />
          <div className="text-left">
            <span className="font-semibold text-white">{promptName}</span>
            <span className="text-slate-400 ml-3">
              Function:{' '}
              <code className="text-cyan-400 bg-slate-700/50 px-1.5 py-0.5 rounded text-sm">{result.functionName}</code>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              result.success
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            {result.success ? 'Success' : 'Failed'}
          </span>
          <span className="text-slate-400 text-sm">
            {result.attempts.length} attempt{result.attempts.length !== 1 ? 's' : ''} ·{' '}
            {formatDuration(result.totalDurationMs)}
          </span>
          <Icon
            name="chevronDown"
            className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-700">
          <SideMenu
            items={[
              {
                id: 'finalCode',
                type: 'button',
                label: 'Final Code',
                icon: 'code',
              },
              {
                id: 'flows',
                type: 'divider',
              },
              {
                id: 'setupFlow',
                type: 'button',
                label: 'Setup Flow',
                icon: 'document',
              },
              {
                id: 'programmaticFlow',
                type: 'button',
                label: 'Programmatic Flow',
                icon: 'settings',
                disabled: !result.programmaticFlow,
                tooltip: 'Programmatic-flow is not enabled.',
              },
              {
                id: 'aiPoweredFlow',
                type: 'button',
                label: 'AI-Powered Flow',
                icon: 'sparkles',
                disabled: result.attempts.length === 0,
                tooltip: 'No AI-powered attempts available for this prompt.',
              },
            ]}
            defaultActiveId="finalCode"
            content={(tab) => {
              switch (tab.id) {
                case 'finalCode':
                  return <BestResultCode result={result} />;
                case 'setupFlow':
                  return <AttemptContent attempt={result.setupFlow} />;
                case 'programmaticFlow':
                  return <AttemptContent attempt={result.programmaticFlow!} />;
                case 'aiPoweredFlow':
                  return <AIPoweredFlowContent result={result} />;
                default:
                  return null;
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

interface AIPoweredFlowContentProps {
  result: ReportPromptResult;
}

/**
 * Build a synthetic ReportPluginResult from a background task,
 * so we can reuse PluginDetails to render its sections.
 */
function isPermuterTask(task: ReportBackgroundTask): task is ReportPermuterBackgroundTask {
  return task.pluginId === 'decomp-permuter';
}

function buildBackgroundTaskDetails(task: ReportBackgroundTask): ReportPluginResult {
  const sections: ReportSection[] = [];

  if (isPermuterTask(task)) {
    const { data } = task;
    sections.push({
      type: 'message',
      title: 'Permuter Results',
      message: [
        `Base score: ${data.baseScore}`,
        `Best score: ${data.bestScore}`,
        `Iterations: ${data.iterationsRun}`,
        `Duration: ${formatDuration(task.durationMs)}`,
        `Triggered by: Attempt ${task.triggeredByAttempt}`,
        `Perfect match: ${task.success ? 'Yes' : 'No'}`,
      ].join('\n'),
    });

    if (data.bestDiff) {
      sections.push({
        type: 'code',
        title: 'Best Permutation Diff',
        language: 'diff',
        code: data.bestDiff,
      });
    }

    if (data.stdout) {
      sections.push({
        type: 'code',
        title: 'stdout',
        language: 'text',
        code: data.stdout,
      });
    }

    if (data.stderr) {
      sections.push({
        type: 'code',
        title: 'stderr',
        language: 'text',
        code: data.stderr,
      });
    }
  }

  if ('error' in task.data) {
    sections.push({
      type: 'message',
      title: 'Error',
      message: task.data.error ?? 'An unknown error occurred during this background task.',
    });
  }

  return {
    pluginId: task.pluginId,
    pluginName: `${task.pluginId} (${task.taskId})`,
    status: task.success ? 'success' : 'failure',
    durationMs: task.durationMs,
    sections,
  };
}

function AIPoweredFlowContent({ result }: AIPoweredFlowContentProps) {
  const [selectedTimelineTaskId, setSelectedTimelineTaskId] = useState<string | null>(null);
  const hasTimeline = result.attempts.length > 0 || (result.backgroundTasks && result.backgroundTasks.length > 0);

  // Find the background task matching the selected Gantt bar
  const selectedBackgroundTask = selectedTimelineTaskId
    ? result.backgroundTasks?.find((t) => t.taskId === selectedTimelineTaskId)
    : null;

  // Find the attempt matching the selected Gantt bar (IDs are "attempt-<number>")
  const selectedAttempt =
    selectedTimelineTaskId && selectedTimelineTaskId.startsWith('attempt-')
      ? result.attempts.find((a) => a.attemptNumber === Number(selectedTimelineTaskId.replace('attempt-', '')))
      : null;

  const tabItems = [
    { id: 'pluginFlow', name: 'Plugin Flow', icon: 'bolt' as const },
    { id: 'attemptsChart', name: 'Attempts Chart', icon: 'lineChart' as const },
    ...(hasTimeline ? [{ id: 'timeline', name: 'Timeline', icon: 'clock' as const }] : []),
  ];

  return (
    <Tabs
      items={tabItems}
      content={(tab) => {
        switch (tab.id) {
          case 'pluginFlow':
            return (
              <Tabs
                items={result.attempts.toReversed().map((attempt) => ({
                  id: `attempt-${attempt.attemptNumber}`,
                  name: (
                    <>
                      Attempt {attempt.attemptNumber}
                      <span
                        className={`w-2 h-2 rounded-full ${
                          attempt.success
                            ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50'
                            : 'bg-red-400 shadow-lg shadow-red-500/50'
                        }`}
                      />
                    </>
                  ),
                }))}
                content={(_tab, index) => {
                  const attemptIndex = result.attempts.length - 1 - index;
                  const attempt = result.attempts[attemptIndex];
                  return <AttemptContent attempt={attempt} />;
                }}
              />
            );
          case 'attemptsChart':
            return <AttemptsChart result={result} />;
          case 'timeline':
            return (
              <>
                <TimelineChart
                  result={result}
                  activeTaskId={selectedTimelineTaskId}
                  onTaskSelect={setSelectedTimelineTaskId}
                />
                {selectedAttempt && <AttemptContent attempt={selectedAttempt} />}
                {selectedBackgroundTask && (
                  <div className="px-5 pb-5">
                    <PluginDetails plugin={buildBackgroundTaskDetails(selectedBackgroundTask)} />
                  </div>
                )}
                {selectedTimelineTaskId &&
                  !selectedAttempt &&
                  !selectedBackgroundTask &&
                  selectedTimelineTaskId.startsWith('permuter-') && (
                    <p className="px-5 pb-5 text-sm text-slate-500 text-center py-6 bg-slate-800/30 rounded-lg border border-slate-700/30 mx-5">
                      No details available for this task.
                    </p>
                  )}
              </>
            );
          default:
            return null;
        }
      }}
    />
  );
}
