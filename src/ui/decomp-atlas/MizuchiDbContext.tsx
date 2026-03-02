import type { MizuchiDb } from '@shared/mizuchi-db/mizuchi-db';
import { createContext, useContext } from 'react';

const MizuchiDbContext = createContext<MizuchiDb | null>(null);

export function MizuchiDbProvider({ db, children }: { db: MizuchiDb; children: React.ReactNode }) {
  return <MizuchiDbContext.Provider value={db}>{children}</MizuchiDbContext.Provider>;
}

export function useMizuchiDb(): MizuchiDb {
  const db = useContext(MizuchiDbContext);
  if (!db) {
    throw new Error('useMizuchiDb must be used within a MizuchiDbProvider');
  }
  return db;
}
