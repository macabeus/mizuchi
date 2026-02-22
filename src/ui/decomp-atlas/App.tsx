import type { PlatformTarget } from '@shared/kappa-db/asm-metrics';
import { KappaDb, type KappaDbDump } from '@shared/kappa-db/kappa-db';
import { FileLoader } from '@ui-shared/components/FileLoader';
import { useState } from 'react';

import { KappaDbProvider } from './KappaDbContext';
import { Main } from './components/Main';

export function App() {
  const [db, setDb] = useState<KappaDb | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<PlatformTarget>('arm');
  const [pendingDump, setPendingDump] = useState<{ data: KappaDbDump; name: string } | null>(null);

  const loadDb = (dump: KappaDbDump, name: string, plat: PlatformTarget) => {
    try {
      setDb(KappaDb.fromDump(dump, plat));
      setFileName(name);
      setError(null);
      setPendingDump(null);
    } catch (e) {
      setError(`Failed to parse kappa-db: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleFileLoaded = (data: unknown, name: string) => {
    const dump = data as KappaDbDump;
    if (!dump.decompFunctions || !dump.vectors) {
      setError('Invalid kappa-db.json format: missing decompFunctions or vectors.');
      return;
    }
    setPendingDump({ data: dump, name });
  };

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
          <h2 className="text-xl font-bold text-white mb-2">Error Loading File</h2>
          <p className="text-red-400 mb-4">{error}</p>
          <button
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all"
            onClick={() => {
              setError(null);
              setPendingDump(null);
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (pendingDump) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700 shadow-xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-white mb-2">Select Platform</h2>
          <p className="text-slate-400 text-sm mb-6">
            Choose the target platform for <span className="text-white font-medium">{pendingDump.name}</span>
          </p>

          <div className="flex gap-3 mb-6">
            {[
              { value: 'arm' as const, label: 'GBA', detail: 'ARM / Thumb' },
              { value: 'mips' as const, label: 'N64', detail: 'MIPS' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPlatform(opt.value)}
                className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                  platform === opt.value
                    ? 'border-cyan-500 bg-cyan-500/10 text-white'
                    : 'border-slate-600 bg-slate-700/30 text-slate-400 hover:border-slate-500'
                }`}
              >
                <div className="font-semibold text-lg">{opt.label}</div>
                <div className="text-sm opacity-70">{opt.detail}</div>
              </button>
            ))}
          </div>

          <button
            className="w-full px-6 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all"
            onClick={() => loadDb(pendingDump.data, pendingDump.name, platform)}
          >
            Load
          </button>
        </div>
      </div>
    );
  }

  if (!db) {
    return (
      <FileLoader
        onFileLoaded={handleFileLoaded}
        accept=".json"
        title="Load kappa-db.json"
        description="Drag and drop a kappa-db.json file here, or click to browse"
      />
    );
  }

  return (
    <KappaDbProvider db={db}>
      <Main fileName={fileName} />
    </KappaDbProvider>
  );
}
