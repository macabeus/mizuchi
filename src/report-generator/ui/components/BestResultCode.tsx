import { ReportAttempt, ReportPromptResult } from '~/report-generator/types';

import { getPluginResult } from '../../../shared/utils.js';
import { CodeBlock } from './CodeBlock';
import { Icon } from './Icon';

interface BestResultProps {
  result: ReportPromptResult;
}

export function BestResultCode({ result }: BestResultProps) {
  // Consider both programmatic and AI-powered flows
  const allAttempts = [...(result.programmaticFlow ? [result.programmaticFlow] : []), ...result.attempts];

  const bestAttempt = allAttempts.reduce<ReportAttempt | null>((best, attempt) => {
    if (
      getPluginResult(attempt, 'compiler')?.status !== 'success' ||
      getPluginResult(attempt, 'objdiff')?.data?.differenceCount === undefined
    ) {
      return best;
    }

    if (best === null) {
      return attempt;
    }

    const bestObjdiffPluginResult = getPluginResult(best, 'objdiff');
    const attemptObjdiffPluginResult = getPluginResult(attempt, 'objdiff');

    if (
      (attemptObjdiffPluginResult?.data?.differenceCount ?? Infinity) <
      (bestObjdiffPluginResult?.data?.differenceCount ?? Infinity)
    ) {
      return attempt;
    }

    return best;
  }, null);

  // Try claude-runner first, then m2c for programmatic-flow attempts
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
            Compiling code with {getPluginResult(bestAttempt, 'objdiff')?.data?.differenceCount} difference(s)
          </h4>
        )}
      </div>

      <CodeBlock code={bestAttemptCode} language="c" />
    </div>
  );
}
