import { Header } from '@ui-shared/components/Header';
import { Tabs } from '@ui-shared/components/Tabs';
import { useCallback, useState } from 'react';

import { useKappaDb } from '../KappaDbContext';
import { FunctionDetails } from './FunctionDetails';
import { FunctionScoring } from './FunctionScoring';
import { ScatterChart } from './ScatterChart';
import { Sidebar } from './Sidebar';

interface MainProps {
  fileName: string;
}

export function Main({ fileName }: MainProps) {
  const db = useKappaDb();
  const stats = db.getStats();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFunctionId, setSelectedFunctionId] = useState<string | null>(null);

  const handleCloseDetails = useCallback(() => {
    setSelectedFunctionId(null);
  }, []);

  return (
    <div className="min-h-screen">
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <Header
          subtitle="Decomp Atlas"
          rightContent={
            <div>
              <p className="text-white font-semibold">{fileName}</p>
              <p className="text-slate-300 text-sm">
                {stats.totalFunctions} functions &middot; {stats.decompiledFunctions} decompiled
              </p>
            </div>
          }
        />

        <Tabs
          items={
            [
              { id: 'embeddings', name: 'Embeddings Map', icon: 'lineChart' },
              { id: 'difficulty', name: 'Function Scoring', icon: 'barChart' },
            ] as const
          }
          content={(tab) => (
            <>
              {tab.id === 'embeddings' && (
                <>
                  <div className="flex gap-4 mt-4">
                    <Sidebar selectedPath={selectedPath} onPathSelect={setSelectedPath} />

                    <div className="flex-1 min-w-0">
                      <ScatterChart
                        selectedPath={selectedPath}
                        selectedFunctionId={selectedFunctionId}
                        onFunctionSelect={setSelectedFunctionId}
                        onFunctionDeselect={handleCloseDetails}
                      />
                    </div>
                  </div>
                </>
              )}

              {tab.id === 'difficulty' && (
                <FunctionScoring selectedFunctionId={selectedFunctionId} onFunctionSelect={setSelectedFunctionId} />
              )}

              {selectedFunctionId && (
                <FunctionDetails
                  functionId={selectedFunctionId}
                  onFunctionSelect={setSelectedFunctionId}
                  onClose={handleCloseDetails}
                />
              )}
            </>
          )}
        />
      </div>
    </div>
  );
}
