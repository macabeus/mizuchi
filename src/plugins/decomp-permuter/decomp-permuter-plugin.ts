/**
 * decomp-permuter Plugin
 *
 * Runs decomp-permuter to brute-force code mutations that improve the match
 * percentage against a target binary.
 *
 * Operates in two modes from a single config:
 * - Sequential (programmatic-flow): runs via execute() in the m2c → compiler → permuter → objdiff chain
 * - Background (AI-powered flow): runs via the background capability alongside Claude attempts
 */
import { z } from 'zod';

import { CCompiler } from '~/shared/c-compiler/c-compiler.js';
import type { PlatformTarget } from '~/shared/config.js';
import {
  DecompPermuter,
  type DecompPermuterOptions,
  type DecompPermuterResult,
  getToolchainForTarget,
} from '~/shared/decomp-permuter.js';
import type {
  BackgroundCapability,
  BackgroundSpawnContext,
  BackgroundTaskResult,
  PipelineContext,
  Plugin,
  PluginReportSection,
  PluginResult,
  TaskMetadata,
} from '~/shared/types.js';

/**
 * Configuration schema for DecompPermuterPlugin
 */
export const decompPermuterConfigSchema = z.object({
  enable: z.boolean().default(false),
  maxIterations: z.number().default(1000),
  timeoutMs: z.number().default(120000),
  flags: z.array(z.string()).default(['--show-errors', '-j', '4']),
  /** Override the permuter's compiler_type for randomization weights.
   *  When omitted, inferred from the pipeline's `target` platform. */
  compilerType: z.enum(['base', 'ido', 'mwcc', 'gcc']).optional(),
});

export type DecompPermuterConfig = z.infer<typeof decompPermuterConfigSchema>;

/**
 * Config passed to the background permuter's run() method
 */
interface PermuterSpawnConfig {
  code: string;
  functionName: string;
  targetObjectPath: string;
  compilerScript: string;
  target: PlatformTarget;
  compilerType: string;
  contextContent?: string;
  timeoutMs: number;
  flags?: string[];
}

export class DecompPermuterPlugin implements Plugin<DecompPermuterResult> {
  static readonly pluginId = 'decomp-permuter';
  static readonly configSchema = decompPermuterConfigSchema;

  readonly id = DecompPermuterPlugin.pluginId;
  readonly name = 'decomp-permuter';
  readonly description = 'Brute-forces code mutations to improve match percentage';

  #config: DecompPermuterConfig;
  #permuter: DecompPermuter;
  #cCompiler: CCompiler;

  // Background spawn tracking (reset between prompts)
  #bestDifferenceCount = Infinity;
  #spawnedCodes = new Set<string>();

  constructor(config: DecompPermuterConfig, cCompiler: CCompiler) {
    this.#config = config;
    this.#permuter = new DecompPermuter();
    this.#cCompiler = cCompiler;
  }

  /** Resolve the permuter compiler_type: explicit config > inferred from target */
  #resolveCompilerType(target: PlatformTarget): string {
    return this.#config.compilerType ?? getToolchainForTarget(target).defaultCompilerType;
  }

  /**
   * Background execution capability.
   * The coordinator calls shouldSpawn() after each AI-powered flow attempt,
   * and spawns a background permuter task when the score improves.
   */
  readonly background: BackgroundCapability<PermuterSpawnConfig, DecompPermuterResult> = {
    shouldSpawn: (ctx: BackgroundSpawnContext): PermuterSpawnConfig | null => {
      if (!ctx.willRetry) {
        return null;
      }

      const objdiffResult = ctx.attemptResults.find((r) => r.pluginId === 'objdiff');
      const differenceCount = (objdiffResult?.data as { differenceCount?: number } | undefined)?.differenceCount;
      if (differenceCount === undefined || differenceCount > this.#bestDifferenceCount) {
        return null;
      }

      const code = ctx.context.generatedCode;
      if (!code || this.#spawnedCodes.has(code)) {
        return null;
      }

      this.#bestDifferenceCount = differenceCount;
      this.#spawnedCodes.add(code);

      return {
        code,
        functionName: ctx.context.functionName,
        targetObjectPath: ctx.context.targetObjectPath!,
        compilerScript: ctx.context.config.compilerScript,
        target: ctx.context.config.target,
        compilerType: this.#resolveCompilerType(ctx.context.config.target),
        contextContent: ctx.context.contextContent,
        timeoutMs: 24 * 60 * 60 * 1000, // 24h — effectively no timeout; cancelAll() manages lifecycle
        flags: this.#config.flags,
      };
    },

    run: (config: PermuterSpawnConfig, signal: AbortSignal): Promise<DecompPermuterResult> => {
      const options: DecompPermuterOptions = {
        cCode: config.code,
        targetObjectPath: config.targetObjectPath,
        functionName: config.functionName,
        compilerScript: config.compilerScript,
        target: config.target,
        compilerType: config.compilerType,
        contextContent: config.contextContent,
        timeoutMs: config.timeoutMs,
        signal,
        flags: config.flags,
      };
      return this.#permuter.run(options);
    },

    isSuccess: (result: DecompPermuterResult): boolean => {
      return result.perfectMatch;
    },

    toBackgroundTaskResult: (result: DecompPermuterResult, metadata: TaskMetadata): BackgroundTaskResult => {
      return {
        ...metadata,
        pluginId: this.id,
        success: result.perfectMatch,
        data: result,
      };
    },

    reset: (): void => {
      this.#bestDifferenceCount = Infinity;
      this.#spawnedCodes.clear();
    },
  };

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<DecompPermuterResult>;
    context: PipelineContext;
  }> {
    const startTime = Date.now();

    if (!context.generatedCode) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No generated code to permute',
        },
        context,
      };
    }

    if (!context.compiledObjectPath) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'Code must compile before running decomp-permuter',
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
          error: 'No target object path available',
        },
        context,
      };
    }

    try {
      const result = await this.#permuter.run({
        cCode: context.generatedCode,
        targetObjectPath: context.targetObjectPath,
        functionName: context.functionName,
        compilerScript: context.config.compilerScript,
        target: context.config.target,
        compilerType: this.#resolveCompilerType(context.config.target),
        contextContent: context.contextContent,
        maxIterations: this.#config.maxIterations,
        timeoutMs: this.#config.timeoutMs,
        flags: this.#config.flags,
      });

      if (result.error) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: result.error,
            output: `Base score: ${result.baseScore}, Best score: ${result.bestScore}, Iterations: ${result.iterationsRun}`,
            data: result,
          },
          context,
        };
      }

      const improved = result.bestCode && result.bestScore < result.baseScore;
      const updatedContext = { ...context };

      // If we found an improvement, update the context with the best code
      // and recompile to update compiledObjectPath for downstream plugins (objdiff)
      if (improved && result.bestCode) {
        updatedContext.generatedCode = result.bestCode;

        const compileResult = await this.#cCompiler.compile(
          context.functionName,
          result.bestCode,
          context.contextContent || '',
        );

        if (compileResult.success) {
          updatedContext.compiledObjectPath = compileResult.objPath;
        }
      }

      const output = [
        `Base score: ${result.baseScore}`,
        `Best score: ${result.bestScore}`,
        `Iterations: ${result.iterationsRun}`,
        result.perfectMatch ? 'Perfect match found!' : improved ? 'Improved but not perfect' : 'No improvement found',
      ].join('\n');

      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: result.perfectMatch ? 'success' : 'failure',
          durationMs: Date.now() - startTime,
          output,
          data: result,
        },
        context: updatedContext,
      };
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

  getReportSections(result: PluginResult<DecompPermuterResult>): PluginReportSection[] {
    const sections: PluginReportSection[] = [];

    if (result.data) {
      sections.push({
        type: 'message',
        title: 'Permuter Results',
        message: [
          `Base score: ${result.data.baseScore}`,
          `Best score: ${result.data.bestScore}`,
          `Iterations: ${result.data.iterationsRun}`,
          `Perfect match: ${result.data.perfectMatch ? 'Yes' : 'No'}`,
        ].join('\n'),
      });
    }

    if (result.data?.bestCode) {
      sections.push({
        type: 'code',
        title: 'Best Permuted Code',
        language: 'c',
        code: result.data.bestCode,
      });
    }

    if (result.data?.bestDiff) {
      sections.push({
        type: 'code',
        title: 'Best Permutation Diff',
        language: 'diff',
        code: result.data.bestDiff,
      });
    }

    if (result.data?.stdout) {
      sections.push({
        type: 'code',
        title: 'stdout',
        language: 'text',
        code: result.data.stdout,
      });
    }

    if (result.data?.stderr) {
      sections.push({
        type: 'code',
        title: 'stderr',
        language: 'text',
        code: result.data.stderr,
      });
    }

    if (result.error) {
      sections.push({
        type: 'message',
        title: 'Error',
        message: result.error,
      });
    }

    return sections;
  }
}
