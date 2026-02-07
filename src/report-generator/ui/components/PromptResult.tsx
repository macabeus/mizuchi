import { useState } from 'react';

import type { ReportAttempt, ReportPromptResult } from '../../types';
import { AttemptsChart } from './AttemptsChart';
import { BestResultCode } from './BestResultCode';
import { Icon } from './Icon';
import { PluginDetails } from './PluginDetails';
import { PluginFlow } from './PluginFlow';
import { SideMenu } from './SideMenu';
import { Tabs } from './Tabs';

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
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [prePipelinePluginId, setPrePipelinePluginId] = useState<string | null>(null);

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
                icon: 'code' as const,
              },
              {
                id: 'flows',
                type: 'divider',
              },
              {
                id: 'programmaticFlow',
                type: 'button',
                label: 'Programmatic Flow',
                icon: 'settings' as const,
                disabled: !result.programmaticFlow,
                tooltip: 'Programmatic-flow is not enabled.',
              },
              {
                id: 'aiPoweredFlow',
                type: 'button',
                label: 'AI-Powered Flow',
                icon: 'sparkles' as const,
                disabled: result.attempts.length === 0,
                tooltip: 'No AI-powered attempts available for this prompt.',
              },
            ]}
            defaultActiveId="finalCode"
            content={(tab) => {
              switch (tab.id) {
                case 'finalCode':
                  return <BestResultCode result={result} />;
                case 'programmaticFlow':
                  return (
                    <AttemptContent
                      attempt={result.programmaticFlow!}
                      selectedPluginId={prePipelinePluginId}
                      onSelectPlugin={setPrePipelinePluginId}
                    />
                  );
                case 'aiPoweredFlow':
                  return (
                    <AIPoweredFlowContent
                      result={result}
                      selectedPluginId={selectedPluginId}
                      onSelectPlugin={setSelectedPluginId}
                    />
                  );
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
  selectedPluginId: string | null;
  onSelectPlugin: (id: string | null) => void;
}

function AIPoweredFlowContent({ result, selectedPluginId, onSelectPlugin }: AIPoweredFlowContentProps) {
  return (
    <Tabs
      items={
        [
          { id: 'pluginFlow', name: 'Plugin Flow', icon: 'bolt' },
          { id: 'attemptsChart', name: 'Attempts Chart', icon: 'lineChart' },
        ] as const
      }
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
                  return (
                    <AttemptContent
                      attempt={attempt}
                      selectedPluginId={selectedPluginId}
                      onSelectPlugin={onSelectPlugin}
                    />
                  );
                }}
                onTabChange={() => onSelectPlugin(null)}
              />
            );
          case 'attemptsChart':
            return <AttemptsChart result={result} />;
          default:
            const _exhaustiveCheck: never = tab;
            console.warn('Unhandled tab in AIPoweredFlowContent:', _exhaustiveCheck);
            return null;
        }
      }}
    />
  );
}

interface AttemptContentProps {
  attempt: ReportAttempt;
  selectedPluginId: string | null;
  onSelectPlugin: (id: string | null) => void;
}

function AttemptContent({ attempt, selectedPluginId, onSelectPlugin }: AttemptContentProps) {
  const selectedPlugin = selectedPluginId ? attempt.pluginResults.find((p) => p.pluginId === selectedPluginId) : null;

  return (
    <div className="p-5">
      {/* Plugin Flow Visualization */}
      <div className="mb-5">
        <h5 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <Icon name="bolt" className="w-4 h-4 text-slate-400" />
          Plugin Execution Flow
        </h5>

        <PluginFlow
          plugins={attempt.pluginResults}
          selectedPluginId={selectedPluginId}
          onSelectPlugin={onSelectPlugin}
        />
      </div>

      {/* Selected Plugin Details */}
      {selectedPlugin && (
        <div className="mt-5 pt-5 border-t border-slate-700">
          <PluginDetails plugin={selectedPlugin} />
        </div>
      )}

      {/* Show hint if no plugin selected */}
      {!selectedPlugin && (
        <p className="text-sm text-slate-500 text-center py-6 bg-slate-800/30 rounded-lg border border-slate-700/30">
          Click on a plugin in the flow above to view its details
        </p>
      )}
    </div>
  );
}
