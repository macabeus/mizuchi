import { getPluginResult } from '@shared/utils.js';
import { Icon } from '@ui-shared/components/Icon';

import { ReportAttempt, type ReportPermuterBackgroundTask, ReportPromptResult } from '~/report-generator/types';

import { CodeBlock } from './CodeBlock';

const matchSourceLabels: Record<string, { label: string; color: string }> = {
  claude: { label: 'Claude', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  'decomp-permuter': { label: 'Permuter', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  'programmatic-phase': { label: 'Programmatic', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
};

interface BestResultProps {
  result: ReportPromptResult;
}

export function BestResultCode({ result }: BestResultProps) {
  // Check if the permuter found a better result
  const permuterSuccess = result.backgroundTasks?.find(
    (t): t is ReportPermuterBackgroundTask => t.pluginId === 'decomp-permuter' && t.success,
  );
  const permuterBestCode = permuterSuccess?.data.bestCode;

  // Consider both programmatic and AI-powered phases
  const allAttempts = [...(result.programmaticPhase ? [result.programmaticPhase] : []), ...result.attempts];

  // Helper to get mismatch count from either objdiff or behavioral-match
  const getMismatchCount = (attempt: ReportAttempt): number | undefined => {
    const objdiff = getPluginResult(attempt, 'objdiff');
    if (objdiff?.data?.differenceCount !== undefined) {
      return objdiff.data.differenceCount;
    }
    const behavioral = getPluginResult(attempt, 'behavioral-match');
    if (behavioral?.data?.mismatchCount !== undefined) {
      return behavioral.data.mismatchCount;
    }
    return undefined;
  };

  const bestAttempt = allAttempts.reduce<ReportAttempt | null>((best, attempt) => {
    if (getPluginResult(attempt, 'compiler')?.status !== 'success' || getMismatchCount(attempt) === undefined) {
      return best;
    }

    if (best === null) {
      return attempt;
    }

    if ((getMismatchCount(attempt) ?? Infinity) < (getMismatchCount(best) ?? Infinity)) {
      return attempt;
    }

    return best;
  }, null);

  // If permuter found a perfect match, use its code
  if (permuterBestCode && result.matchSource === 'decomp-permuter') {
    const badge = matchSourceLabels['decomp-permuter'];
    return (
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-emerald-400 flex items-center gap-2">
            <Icon name="checkCircle" className="w-5 h-5" />
            Fully matching code
          </h4>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}>{badge.label}</span>
        </div>
        <CodeBlock code={permuterBestCode} language="c" />
      </div>
    );
  }

  // Try claude-runner first, then m2c for programmatic phase attempts
  const bestAttemptCode =
    bestAttempt &&
    (getPluginResult(bestAttempt, 'claude-runner')?.data?.generatedCode ||
      getPluginResult(bestAttempt, 'm2c')?.data?.generatedCode);

  if (!bestAttemptCode) {
    return (
      <div className="p-5">
        <div className="flex items-center gap-2 text-red-400">No working code available</div>
      </div>
    );
  }

  const badge = result.matchSource ? matchSourceLabels[result.matchSource] : undefined;

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        {bestAttempt.success ? (
          <h4 className="font-semibold text-emerald-400 flex items-center gap-2">
            <Icon name="checkCircle" className="w-5 h-5" />
            Fully matching code
          </h4>
        ) : (
          <h4 className="font-semibold text-yellow-400 flex items-center gap-2">
            <Icon name="checkCircle" className="w-5 h-5" />
            Compiling code with {getMismatchCount(bestAttempt)} difference(s)
          </h4>
        )}
        {badge && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}>{badge.label}</span>
        )}
      </div>

      <CodeBlock code={bestAttemptCode} language="c" />
    </div>
  );
}
