import type { KappaDb } from '@shared/kappa-db';
import { createContext, useContext } from 'react';

const KappaDbContext = createContext<KappaDb | null>(null);

export function KappaDbProvider({ db, children }: { db: KappaDb; children: React.ReactNode }) {
  return <KappaDbContext.Provider value={db}>{children}</KappaDbContext.Provider>;
}

export function useKappaDb(): KappaDb {
  const db = useContext(KappaDbContext);
  if (!db) {
    throw new Error('useKappaDb must be used within a KappaDbProvider');
  }
  return db;
}
