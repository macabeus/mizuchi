import { Header } from '@ui-shared/components/Header';
import type { IconName } from '@ui-shared/components/Icon';
import { Tabs } from '@ui-shared/components/Tabs';
import { useCallback, useState } from 'react';

import { useMizuchiDb } from '../MizuchiDbContext';
import { FunctionDetails } from './FunctionDetails';
import { FunctionScoring } from './FunctionScoring';
import { PromptBuilder } from './PromptBuilder';
import { ScatterChart } from './ScatterChart';
import { Sidebar } from './Sidebar';

const tabItems: { id: string; name: string; icon: IconName }[] = [
  { id: 'embeddings', name: 'Embeddings Map', icon: 'lineChart' },
  { id: 'difficulty', name: 'Function Scoring', icon: 'barChart' },
  { id: 'prompt-builder', name: 'Prompt Builder', icon: 'code' },
];

interface MainProps {
  projectName: string;
}

export function Main({ projectName }: MainProps) {
  const db = useMizuchiDb();
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
              <p className="text-white font-semibold">{projectName}</p>
              <p className="text-slate-300 text-sm">
                {stats.totalFunctions} functions &middot; {stats.decompiledFunctions} decompiled
              </p>
            </div>
          }
        />

        <div className="flex gap-4 mt-4">
          <Sidebar
            selectedPath={selectedPath}
            onPathSelect={setSelectedPath}
            selectedFunctionId={selectedFunctionId}
            onFunctionSelect={setSelectedFunctionId}
          />

          <div className="flex-1 min-w-0">
            <Tabs
              items={tabItems}
              content={(tab) => (
                <>
                  {tab.id === 'embeddings' && (
                    <div className="mt-4">
                      <ScatterChart
                        selectedPath={selectedPath}
                        selectedFunctionId={selectedFunctionId}
                        onFunctionSelect={setSelectedFunctionId}
                        onFunctionDeselect={handleCloseDetails}
                      />
                    </div>
                  )}

                  {tab.id === 'difficulty' && (
                    <FunctionScoring selectedFunctionId={selectedFunctionId} onFunctionSelect={setSelectedFunctionId} />
                  )}

                  {tab.id === 'prompt-builder' && <PromptBuilder selectedFunctionId={selectedFunctionId} />}
                </>
              )}
            />
          </div>
        </div>

        {selectedFunctionId && (
          <FunctionDetails
            functionId={selectedFunctionId}
            onFunctionSelect={setSelectedFunctionId}
            onClose={handleCloseDetails}
          />
        )}
      </div>
    </div>
  );
}
