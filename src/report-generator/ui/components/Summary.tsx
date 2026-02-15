import type { ReportConfig, ReportSummary } from '../../types';
import { CodeBlock } from './CodeBlock';
import { Icon } from './Icon';

interface SummaryProps {
  summary: ReportSummary;
  config: ReportConfig;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');

  return `${mm}:${ss}`;
}

export function Summary({ summary, config }: SummaryProps) {
  const successRateGradient =
    summary.successRate >= 70
      ? 'from-emerald-400 to-green-500'
      : summary.successRate >= 40
        ? 'from-amber-400 to-yellow-500'
        : 'from-red-400 to-rose-500';

  return (
    <div className="space-y-6 mb-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Success Rate - Featured Card */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-5 text-center border border-slate-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative">
            <div className={`text-4xl font-bold bg-gradient-to-r ${successRateGradient} bg-clip-text text-transparent`}>
              {summary.successRate.toFixed(1)}%
            </div>
            <div className="text-slate-400 text-sm mt-1 font-medium">Success Rate</div>
          </div>
        </div>

        {/* Total Prompts */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-5 text-center border border-slate-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative">
            <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              {summary.totalPrompts}
            </div>
            <div className="text-slate-400 text-sm mt-1 font-medium">Total Prompts</div>
          </div>
        </div>

        {/* Successful */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-5 text-center border border-slate-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative">
            <div className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
              {summary.successfulPrompts}
            </div>
            <div className="text-slate-400 text-sm mt-1 font-medium">Successful</div>
          </div>
        </div>

        {/* Avg Attempts */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-5 text-center border border-slate-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative">
            <div className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              {summary.avgAttempts.toFixed(1)}
            </div>
            <div className="text-slate-400 text-sm mt-1 font-medium">Avg Attempts</div>
          </div>
        </div>

        {/* Total Duration */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-5 text-center border border-slate-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative">
            <div className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
              {formatDuration(summary.totalDurationMs)}
            </div>
            <div className="text-slate-400 text-sm mt-1 font-medium">Total Duration</div>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-lg p-5 border border-slate-700">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <Icon name="settings" className="w-5 h-5 text-slate-400" />
          Configuration
        </h3>
        <div className="space-y-4 text-sm">
          {/* Basic config row */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Target:</span>
              <code className="bg-slate-700/50 px-2 py-1 rounded-md text-emerald-400 font-mono text-xs uppercase">
                {config.target}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Prompts Directory:</span>
              <code className="bg-slate-700/50 px-2 py-1 rounded-md text-cyan-400 font-mono text-xs">
                {config.promptsDir}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Max Retries:</span>
              <span className="text-white font-semibold">{config.maxRetries}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Stall Threshold:</span>
              <span className="text-white font-semibold">{config.stallThreshold}</span>
            </div>
          </div>

          {/* Get Context Script */}
          {config.getContextScript && (
            <div className="border-t border-slate-700 pt-4">
              <details className="group">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-300 flex items-center gap-2">
                  <span className="group-open:rotate-90 transition-transform">▶</span>
                  Get Context Script
                </summary>
                <CodeBlock language="shell" code={config.getContextScript} />
              </details>
            </div>
          )}

          {/* Compiler Script */}
          <div className="border-t border-slate-700 pt-4">
            <details className="group">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-300 flex items-center gap-2">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                Compiler Script
              </summary>
              <CodeBlock language="shell" code={config.compilerScript} />
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
