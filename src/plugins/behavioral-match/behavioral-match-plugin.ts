/**
 * Behavioral Match Plugin
 *
 * Verifies that decompiled code produces identical observable behavior
 * to the original when given the same inputs. Drop-in replacement for
 * ObjdiffPlugin when byte-matching is not required.
 */
import { compareFunction } from '@sgba/arm-emulator';
import type { ComparisonResult, ScenarioResult, SerializedFunction } from '@sgba/arm-emulator';
import { DEFAULT_COMPARISON_CONFIG } from '@sgba/arm-emulator';
import { z } from 'zod';

import type { PipelineConfig } from '~/shared/config.js';
import type { PipelineContext, Plugin, PluginReportSection, PluginResult } from '~/shared/types.js';

/**
 * Configuration schema for BehavioralMatchPlugin
 */
export const behavioralMatchConfigSchema = z.object({
  scenarioCount: z.number().positive().default(DEFAULT_COMPARISON_CONFIG.scenarioCount),
  maxInstructions: z.number().positive().default(DEFAULT_COMPARISON_CONFIG.maxInstructions),
  seed: z.number().default(DEFAULT_COMPARISON_CONFIG.seed),
});

export type BehavioralMatchConfig = z.infer<typeof behavioralMatchConfigSchema>;

/**
 * Result data from behavioral match verification.
 * Structurally identical to ComparisonResult so that run reports
 * can be loaded directly by the GBA Debugger without conversion.
 */
export interface BehavioralMatchResult {
  allMatch: boolean;
  totalScenarios: number;
  matchCount: number;
  mismatchCount: number;
  summary: string;
  scenarios: ScenarioResult[];
  /** Original function code + relocations for interactive debugging */
  originalFunc?: SerializedFunction;
  /** Decompiled function code + relocations for interactive debugging */
  decompiledFunc?: SerializedFunction;
}

/**
 * Behavioral Match Plugin
 *
 * Runs the original and compiled functions through an ARM7TDMI Thumb emulator
 * with identical random inputs, then compares their observable effects:
 * - Return value (r0)
 * - Memory writes (address, size, value)
 * - MMIO writes (order-sensitive)
 * - External function calls (target, arguments)
 */
export class BehavioralMatchPlugin implements Plugin<BehavioralMatchResult> {
  static readonly pluginId = 'behavioral-match';
  static readonly configSchema = behavioralMatchConfigSchema;

  readonly id = BehavioralMatchPlugin.pluginId;
  readonly name = 'Behavioral Match';
  readonly description = 'Verifies decompiled code produces identical behavior to the original';

  #config: BehavioralMatchConfig;

  constructor(config: BehavioralMatchConfig, _pipelineConfig?: PipelineConfig) {
    this.#config = config;
  }

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<BehavioralMatchResult>;
    context: PipelineContext;
  }> {
    const startTime = Date.now();

    if (!context.compiledObjectPath) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No compiled object file to compare',
        },
        context,
      };
    }

    if (!context.targetObjectPath) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No target object file specified',
        },
        context,
      };
    }

    if (!context.functionName) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No function name specified',
        },
        context,
      };
    }

    try {
      const comparison = await compareFunction(
        context.targetObjectPath,
        context.compiledObjectPath,
        context.functionName,
        {
          scenarioCount: this.#config.scenarioCount,
          maxInstructions: this.#config.maxInstructions,
          seed: this.#config.seed,
        },
      );

      const data: BehavioralMatchResult = {
        allMatch: comparison.allMatch,
        totalScenarios: comparison.totalScenarios,
        matchCount: comparison.matchCount,
        mismatchCount: comparison.mismatchCount,
        summary: comparison.summary,
        scenarios: comparison.scenarios,
        originalFunc: comparison.originalFunc,
        decompiledFunc: comparison.decompiledFunc,
      };

      if (comparison.allMatch) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'success',
            durationMs: Date.now() - startTime,
            output: comparison.summary,
            data,
          },
          context,
        };
      } else {
        const failureSummary = this.#formatFailures(comparison);

        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: comparison.summary,
            output: failureSummary,
            data,
          },
          context,
        };
      }
    } catch (error) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        },
        context,
      };
    }
  }

  getReportSections(result: PluginResult<BehavioralMatchResult>, _context: PipelineContext): PluginReportSection[] {
    const sections: PluginReportSection[] = [];

    if (result.data) {
      sections.push({
        type: 'message',
        title: 'Behavioral Comparison',
        message: `${result.data.matchCount}/${result.data.totalScenarios} scenarios matched`,
      });
    }

    // Show failure details from structured scenarios
    const failedScenarios = result.data?.scenarios.filter((s) => !s.match);
    if (failedScenarios && failedScenarios.length > 0) {
      const details = failedScenarios
        .slice(0, 10)
        .flatMap((s) => [`--- Scenario #${s.index}: ${s.inputDescription} ---`, ...s.diffs]);
      sections.push({
        type: 'code',
        title: 'Failure Details',
        language: 'text',
        code: details.join('\n'),
      });
    }

    return sections;
  }

  #formatFailures(comparison: ComparisonResult): string {
    const lines: string[] = [];
    lines.push(`## Behavioral Comparison Results`);
    lines.push(`- Matching: ${comparison.matchCount}/${comparison.totalScenarios}`);
    lines.push(`- Mismatched: ${comparison.mismatchCount}`);
    lines.push('');

    const showCount = Math.min(comparison.scenarios.length, 5);
    for (let i = 0; i < showCount; i++) {
      const scenario = comparison.scenarios[i]!;
      lines.push(`### Scenario #${scenario.index}: ${scenario.inputDescription}`);
      for (const diff of scenario.diffs) {
        lines.push(`  ${diff}`);
      }
      lines.push('');
    }

    if (comparison.scenarios.length > showCount) {
      lines.push(`... and ${comparison.scenarios.length - showCount} more failures`);
    }

    return lines.join('\n');
  }
}
