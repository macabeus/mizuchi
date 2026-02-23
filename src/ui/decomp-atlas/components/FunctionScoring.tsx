import type { AsmMetrics } from '@shared/kappa-db/asm-metrics';
import type { DecompFunctionDoc } from '@shared/kappa-db/kappa-db';
import type { DifficultyModel, DifficultyTier } from '@shared/kappa-db/logistic-regression';
import { CollapsiblePanel } from '@ui-shared/components/CollapsiblePanel';
import type { Column } from '@ui-shared/components/Table';
import { Table } from '@ui-shared/components/Table';
import { WithTooltip } from '@ui-shared/components/WithTooltip';
import { useMemo } from 'react';

import { useKappaDb } from '../KappaDbContext';

interface FunctionScoringProps {
  selectedFunctionId: string | null;
  onFunctionSelect: (id: string) => void;
}

const TIERS: DifficultyTier[] = ['easy', 'medium', 'hard'];
const TIER_COLOR: Record<DifficultyTier, string> = {
  easy: 'rgb(52, 211, 153)',
  medium: 'rgb(251, 191, 36)',
  hard: 'rgb(239, 68, 68)',
};

function ModelCoefficients({
  model,
  stats,
}: {
  model: DifficultyModel;
  stats: { decompiled: number; undecompiled: number };
}) {
  const features = [
    { name: 'Instructions', weight: model.coefficients[0] },
    { name: 'Branches', weight: model.coefficients[1] },
    { name: 'Labels', weight: model.coefficients[2] },
  ];

  return (
    <CollapsiblePanel title="Learned Model Coefficients">
      <table className="text-sm font-mono">
        <thead>
          <tr className="text-slate-500 text-xs">
            <th className="text-left pb-1 pr-8 font-normal">Feature</th>
            <th className="text-right pb-1 font-normal">Weight</th>
          </tr>
        </thead>
        <tbody>
          {features.map((f) => (
            <tr key={f.name} className="border-t border-slate-700/50">
              <td className="py-1 pr-8 text-slate-300">{f.name}</td>
              <td className={`py-1 text-right ${f.weight >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {f.weight >= 0 ? '+' : ''}
                {f.weight.toFixed(4)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-slate-700/50">
            <td className="py-1 pr-8 text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                Intercept
                <WithTooltip tooltip="Baseline score when all features are at their dataset average" position="top">
                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-500 text-slate-500 text-[10px] leading-none cursor-help">
                    i
                  </span>
                </WithTooltip>
              </span>
            </td>
            <td className={`py-1 text-right ${model.intercept >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {model.intercept >= 0 ? '+' : ''}
              {model.intercept.toFixed(4)}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 pt-2 border-t border-slate-700/50 text-xs text-slate-500">
        Training: {stats.decompiled} decompiled / {stats.undecompiled} undecompiled
      </div>
      <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs text-slate-500 leading-relaxed">
        Scores are computed by a logistic regression trained on this dataset. It assumes functions that have already
        been decompiled are, on average, easier — since easier functions usually are tackled first. The model learns how
        each assembly feature (instruction count, branches, labels) relates to that pattern. Positive weights (red) push
        the score toward harder; negative weights (green) push toward easier. The magnitude indicates relative
        importance — the largest weight has the strongest influence on the final score.
      </div>
    </CollapsiblePanel>
  );
}

type FunctionRow = {
  fn: DecompFunctionDoc;
  score: number;
  metrics: AsmMetrics | undefined;
  tier: DifficultyTier;
};

export function FunctionScoring({ selectedFunctionId, onFunctionSelect }: FunctionScoringProps) {
  const db = useKappaDb();
  const scores = useMemo(() => db.getDifficultyScores(), [db]);
  const { tiers, thresholds } = useMemo(() => db.getDifficultyTiers(), [db]);
  const model = useMemo(() => db.difficultyModel, [db]);

  const trainingStats = useMemo(() => {
    const stats = db.getStats();
    return { decompiled: stats.decompiledFunctions, undecompiled: stats.asmOnlyFunctions };
  }, [db]);

  const rows = useMemo(() => {
    return db.functions
      .map((fn) => {
        const ds = scores.get(fn.id);
        const tier = tiers.get(fn.id);
        return { fn, score: ds?.score ?? 0, metrics: ds?.metrics, tier: tier ?? ('easy' as DifficultyTier) };
      })
      .sort((a, b) => b.score - a.score);
  }, [db, scores, tiers]);

  const columns = useMemo(() => {
    const cols: Column<FunctionRow>[] = [
      {
        id: 'rank',
        header: '#',
        width: 'w-12',
        cell: (_, idx) => <span className="text-slate-500 font-mono text-xs">{idx + 1}</span>,
      },
      {
        id: 'tier',
        header: 'Tier',
        width: 'w-16',
        cell: (row) => (
          <span
            className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${TIER_COLOR[row.tier]}20`, color: TIER_COLOR[row.tier] }}
          >
            {row.tier}
          </span>
        ),
      },
      {
        id: 'function',
        header: 'Function',
        cell: (row) => (
          <span className="font-mono text-xs truncate max-w-[300px] block" title={row.fn.name}>
            {row.fn.name}
          </span>
        ),
      },
      {
        id: 'score',
        header: 'Score',
        width: 'w-20',
        cell: (row) => <span className="font-mono text-xs">{row.score.toFixed(4)}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        width: 'w-20',
        cell: (row) => (
          <span className="text-xs">
            {row.fn.cCode ? (
              <span className="text-pink-400">Decompiled</span>
            ) : (
              <span className="text-slate-500">ASM</span>
            )}
          </span>
        ),
      },
    ];

    if (db.platform === 'arm') {
      cols.push({
        id: 'encoding',
        header: 'Enc',
        width: 'w-16',
        cell: (row) => (
          <span className="text-xs">
            {row.metrics?.armEncoding === 'thumb' ? (
              <span className="text-cyan-400">Thumb</span>
            ) : row.metrics?.armEncoding === 'arm32' ? (
              <span className="text-amber-400">ARM32</span>
            ) : (
              '-'
            )}
          </span>
        ),
      });
    }

    cols.push(
      {
        id: 'instr',
        header: 'Instr',
        width: 'w-16',
        align: 'right',
        cell: (row) => <span className="font-mono text-xs">{row.metrics?.instructionCount ?? '-'}</span>,
      },
      {
        id: 'branch',
        header: 'Branch',
        width: 'w-16',
        align: 'right',
        cell: (row) => <span className="font-mono text-xs">{row.metrics?.branchCount ?? '-'}</span>,
      },
      {
        id: 'labels',
        header: 'Labels',
        width: 'w-16',
        align: 'right',
        cell: (row) => <span className="font-mono text-xs">{row.metrics?.labelCount ?? '-'}</span>,
      },
    );

    return cols;
  }, [db.platform]);

  return (
    <div className="mt-4">
      {/* Tier thresholds */}
      <div className="flex gap-4 mb-4">
        {TIERS.map((tier) => (
          <div
            key={tier}
            className="flex-1 bg-slate-800/50 rounded-lg border border-slate-700 px-4 py-3"
            style={{ borderLeftColor: TIER_COLOR[tier], borderLeftWidth: 3 }}
          >
            <div className="text-sm font-medium" style={{ color: TIER_COLOR[tier] }}>
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </div>
            <div className="text-sm text-slate-400 font-mono mt-1">
              {tier === 'easy' && `score \u2264 ${thresholds[0].toFixed(3)}`}
              {tier === 'medium' && `${thresholds[0].toFixed(3)} < score \u2264 ${thresholds[1].toFixed(3)}`}
              {tier === 'hard' && `score > ${thresholds[1].toFixed(3)}`}
            </div>
          </div>
        ))}
      </div>

      {/* Model coefficients */}
      <div className="mb-4">
        <ModelCoefficients model={model} stats={trainingStats} />
      </div>

      {/* Ranked table */}
      <Table<FunctionRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.fn.id}
        selectedKey={selectedFunctionId}
        onRowClick={(row) => onFunctionSelect(row.fn.id)}
        style={{ height: 'calc(100vh - 420px)', minHeight: '400px' }}
      />
    </div>
  );
}
