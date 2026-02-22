import { Icon } from '@ui-shared/components/Icon';
import { useState } from 'react';

import type { ReportAttempt } from '~/report-generator/types';

import { PluginDetails } from './PluginDetails';
import { PluginFlow } from './PluginFlow';

interface AttemptContentProps {
  attempt: ReportAttempt;
}

export function AttemptContent({ attempt }: AttemptContentProps) {
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);

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
          onSelectPlugin={setSelectedPluginId}
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
