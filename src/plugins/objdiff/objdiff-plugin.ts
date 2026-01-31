/**
 * Objdiff Plugin
 *
 * Compares compiled object files with target using objdiff-wasm.
 * Determines if the generated code matches the target assembly.
 */
import { z } from 'zod';

import { PipelineConfig } from '~/shared/config';
import { ObjdiffService } from '~/shared/objdiff.js';
import type { PipelineContext, Plugin, PluginReportSection, PluginResult } from '~/shared/types.js';

/**
 * Configuration schema for ObjdiffPlugin
 *
 * Note: Target object paths are now specified per-prompt in settings.yaml,
 * so this plugin requires no configuration.
 */
export const objdiffConfigSchema = z.object({});

export type ObjdiffConfig = z.infer<typeof objdiffConfigSchema>;

/**
 * Objdiff Plugin result data
 */
export interface ObjdiffResult {
  matchingCount: number;
  differenceCount: number;
  currentAsm: string;
  targetAsm: string;
  differences?: string[];
}

/**
 * Objdiff Plugin
 *
 * Compares compiled object files with target using objdiff-wasm.
 * Target paths are provided per-prompt via the pipeline context.
 */
export class ObjdiffPlugin implements Plugin<ObjdiffResult> {
  static readonly pluginId = 'objdiff';
  static readonly configSchema = objdiffConfigSchema;

  readonly id = ObjdiffPlugin.pluginId;
  readonly name = 'Objdiff';
  readonly description = 'Compares the compiled code with target object file using objdiff';

  #objdiffService: ObjdiffService;

  constructor(_config?: ObjdiffConfig, _pipelineConfig?: PipelineConfig) {
    this.#objdiffService = ObjdiffService.getInstance();
  }

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<ObjdiffResult>;
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
      const [currentObject, targetObject] = await Promise.all([
        this.#objdiffService.parseObjectFile(context.compiledObjectPath, 'base'),
        this.#objdiffService.parseObjectFile(context.targetObjectPath, 'target'),
      ]);

      const diffResult = await this.#objdiffService.runDiff(currentObject, targetObject);

      if (!diffResult.left) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: 'Failed to parse current object file',
          },
          context,
        };
      }

      if (!diffResult.right) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: 'Failed to parse target object file',
          },
          context,
        };
      }

      // Find the function symbol
      const leftSymbol = diffResult.left.findSymbol(context.functionName, undefined);
      const rightSymbol = diffResult.right.findSymbol(context.functionName, undefined);

      if (!leftSymbol || !rightSymbol) {
        const currentSymbols = await this.#objdiffService.getSymbolNames(currentObject);

        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: 'Symbol not found',
            output: `Symbol \`${context.functionName}\` not found.\n\nAvailable symbols in current object: ${currentSymbols.join(', ')}.\n\nDid you named your function as \`${context.functionName}\`?`,
          },
          context,
        };
      }

      // Get detailed differences
      const { matchingCount, differenceCount, differences } = await this.#objdiffService.getDifferences(
        diffResult.left,
        diffResult.right,
        context.functionName,
      );

      // Get assembly for both sides
      const [currentAsm, targetAsm] = await Promise.all([
        this.#objdiffService.getAssemblyFromSymbol(diffResult.left, context.functionName),
        this.#objdiffService.getAssemblyFromSymbol(diffResult.right, context.functionName),
      ]);

      const isMatch = differenceCount === 0;

      let output = `## Current Assembly\n\`\`\`asm\n${currentAsm}\n\`\`\`\n\n`;
      output += `## Target Assembly\n\`\`\`asm\n${targetAsm}\n\`\`\`\n\n`;
      output += `## Summary\n- Matching: ${matchingCount}\n- Different: ${differenceCount}\n\n`;

      if (differences.length > 0) {
        output += `## Differences\n${differences.join('\n')}`;
      }

      if (isMatch) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'success',
            durationMs: Date.now() - startTime,
            output: `Perfect match! ${matchingCount} instructions match.`,
            data: {
              matchingCount,
              differenceCount,
              currentAsm,
              targetAsm,
            },
          },
          context,
        };
      } else {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: `Assembly mismatch: ${differenceCount} differences found`,
            output,
            data: {
              matchingCount,
              differenceCount,
              currentAsm,
              targetAsm,
              differences,
            },
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

  getReportSections(result: PluginResult<ObjdiffResult>, _context: PipelineContext): PluginReportSection[] {
    const sections: PluginReportSection[] = [];

    // Show current assembly
    if (result.data?.currentAsm) {
      sections.push({
        type: 'code',
        title: 'Current Assembly',
        language: 'text',
        code: result.data.currentAsm as string,
      });
    }

    // Show target assembly
    if (result.data?.targetAsm) {
      sections.push({
        type: 'code',
        title: 'Target Assembly',
        language: 'text',
        code: result.data.targetAsm as string,
      });
    }

    // Show differences if any
    if (result.data?.differences && Array.isArray(result.data.differences) && result.data.differences.length > 0) {
      sections.push({
        type: 'code',
        title: 'Differences',
        language: 'diff',
        code: (result.data.differences as string[]).join('\n'),
      });
    }

    // Show summary
    if (result.data?.matchingCount !== undefined || result.data?.differenceCount !== undefined) {
      sections.push({
        type: 'message',
        title: 'Summary',
        message: `Matching: ${result.data.matchingCount ?? 0}, Different: ${result.data.differenceCount ?? 0}`,
      });
    }

    return sections;
  }
}
