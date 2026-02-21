import { Icon } from '@ui-shared/components/Icon';

import type { ReportPluginResult } from '~/report-generator/types';

import { ChatSection } from './ChatSection';
import { CodeBlock } from './CodeBlock';

interface PluginDetailsProps {
  plugin: ReportPluginResult;
}

export function PluginDetails({ plugin }: PluginDetailsProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-white flex items-center gap-2">
          <Icon name="chip" className="w-5 h-5 text-cyan-400" />
          {plugin.pluginName}
        </h4>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            plugin.status === 'success'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : plugin.status === 'failure'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-slate-600/50 text-slate-300 border border-slate-500/30'
          }`}
        >
          {plugin.status.charAt(0).toUpperCase() + plugin.status.slice(1)}
        </span>
      </div>

      {/* Error Message */}
      {plugin.error && (
        <div className="bg-gradient-to-r from-red-900/30 to-rose-900/30 border border-red-500/30 rounded-xl p-4">
          <h5 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
            <Icon name="alertCircle" className="w-4 h-4" />
            Error
          </h5>
          <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono bg-red-950/30 p-3 rounded-lg">
            {plugin.error}
          </pre>
        </div>
      )}

      {/* Report Sections */}
      {plugin.sections && plugin.sections.length > 0 && (
        <div className="space-y-4">
          {plugin.sections.map((section) => (
            <div key={section.title} className="border border-slate-700 rounded-xl overflow-hidden bg-slate-800/30">
              <div className="bg-slate-700/30 px-4 py-2.5 border-b border-slate-700">
                <h5 className="font-medium text-slate-200 flex items-center gap-2">
                  {section.type === 'chat' ? (
                    <Icon name="chat" className="w-4 h-4 text-purple-400" />
                  ) : section.type === 'code' ? (
                    <Icon name="code" className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <Icon name="document" className="w-4 h-4 text-slate-400" />
                  )}
                  {section.title}
                </h5>
              </div>
              <div className="p-4">
                {section.type === 'chat' ? (
                  <ChatSection messages={section.messages} />
                ) : section.type === 'code' ? (
                  <CodeBlock code={section.code} language={section.language} />
                ) : (
                  <p className="text-slate-300 whitespace-pre-wrap">{section.message}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No sections message */}
      {(!plugin.sections || plugin.sections.length === 0) && !plugin.error && (
        <p className="text-sm text-slate-500 text-center py-6 bg-slate-800/30 rounded-lg border border-slate-700/30">
          No additional details available for this plugin.
        </p>
      )}
    </div>
  );
}
