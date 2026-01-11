import React from 'react';

import type { ReportPluginResult } from '../../types';
import { Icon } from './Icon';

interface PluginFlowProps {
  plugins: ReportPluginResult[];
  selectedPluginId: string | null;
  onSelectPlugin: (id: string | null) => void;
}

export function PluginFlow({ plugins, selectedPluginId, onSelectPlugin }: PluginFlowProps) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto py-3 px-1">
      {plugins.map((plugin, index) => (
        <React.Fragment key={plugin.pluginId}>
          {/* Plugin Node */}
          <button
            onClick={() => onSelectPlugin(selectedPluginId === plugin.pluginId ? null : plugin.pluginId)}
            className={`flex-shrink-0 px-4 py-3 rounded-xl transition-all border ${
              selectedPluginId === plugin.pluginId
                ? 'bg-gradient-to-br from-blue-500/30 to-cyan-500/30 border-cyan-400 shadow-lg shadow-cyan-500/20'
                : plugin.status === 'success'
                  ? 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 border-emerald-500/30 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/10'
                  : plugin.status === 'failure'
                    ? 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 border-red-500/30 hover:border-red-400/50 hover:shadow-lg hover:shadow-red-500/10'
                    : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 border-slate-600/50 hover:border-slate-500/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <StatusIndicator status={plugin.status} />
              <span className="font-medium text-white text-sm">{plugin.pluginName}</span>
            </div>
            {plugin.durationMs !== undefined && (
              <div className="text-xs text-slate-400 mt-1">{formatDuration(plugin.durationMs)}</div>
            )}
          </button>

          {/* Arrow between nodes */}
          {index < plugins.length - 1 && (
            <div className="flex-shrink-0 flex items-center">
              <div className="w-4 h-0.5 bg-gradient-to-r from-slate-500 to-slate-600" />
              <Icon name="chevronRight" className="w-4 h-4 text-slate-500 -ml-1" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

interface StatusIndicatorProps {
  status: 'success' | 'failure' | 'skipped';
}

function StatusIndicator({ status }: StatusIndicatorProps) {
  switch (status) {
    case 'success':
      return (
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <Icon name="check" className="w-3 h-3 text-white" />
        </div>
      );
    case 'failure':
      return (
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/30">
          <Icon name="close" className="w-3 h-3 text-white" />
        </div>
      );
    case 'skipped':
      return (
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
          <Icon name="minus" className="w-3 h-3 text-slate-300" />
        </div>
      );
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
