import { KappaDb } from '@shared/kappa-db/kappa-db';
import { useEffect, useState } from 'react';

import { KappaDbProvider } from './KappaDbContext';
import { apiClient } from './api-client';
import { Main } from './components/Main';

export function App() {
  const [db, setDb] = useState<KappaDb | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const config = window.__MIZUCHI_CONFIG__;
    if (!config) {
      setError('No Mizuchi configuration found. Please ensure you are running within the Mizuchi environment.');
      return;
    }

    (async () => {
      try {
        const res = await apiClient.api.loadProject.$post({
          json: { projectPath: config.projectPath },
        });
        const json = await res.json();

        if ('error' in json) {
          setError(`Failed to load project: ${json.error}`);
          return;
        }

        setDb(KappaDb.fromDump(json.data, json.platform));
      } catch (err) {
        setError(`Failed to load project: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="text-center bg-slate-800/50 rounded-2xl p-8 border border-red-500/30 shadow-xl max-w-lg">
          <div className="text-4xl mb-4">
            <svg className="w-16 h-16 mx-auto text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Error Loading Project</h2>
          <p className="text-red-400 mb-4">{error}</p>
        </div>
      </div>
    );
  }

  if (!db) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-300 font-medium">Loading project data...</p>
        </div>
      </div>
    );
  }

  const projectName = window.__MIZUCHI_CONFIG__?.projectPath.split(/[\\/]/).pop() || 'Unknown Project';

  return (
    <KappaDbProvider db={db}>
      <Main projectName={projectName} />
    </KappaDbProvider>
  );
}
