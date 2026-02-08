/**
 * m2c Plugin
 *
 * Generates initial C decompilation using m2c.
 * Runs in the programmatic-flow phase before the AI-powered flow.
 */
import { z } from 'zod';

import { type PlatformTarget } from '~/shared/config.js';
import { M2c } from '~/shared/m2c.js';
import { Objdiff } from '~/shared/objdiff.js';
import type { PipelineContext, Plugin, PluginReportSection, PluginResult } from '~/shared/types.js';

/**
 * m2c supported architecture
 */
type M2cArchitecture = 'arm' | 'mips' | 'mipsel' | 'ppc';

/**
 * Map platform names to m2c supported architectures
 */
const targetMapping: Partial<Record<PlatformTarget, M2cArchitecture>> = {
  gba: 'arm',
  nds: 'arm',
  n3ds: 'arm',
  n64: 'mips',
  gc: 'ppc',
  wii: 'ppc',
  ps1: 'mips',
  ps2: 'mipsel',
  psp: 'mipsel',
};

/**
 * Configuration schema for M2cPlugin
 */
export const m2cConfigSchema = z.object({
  enable: z.boolean().default(true),
});

export type M2cConfig = z.infer<typeof m2cConfigSchema>;

/**
 * m2c plugin result data
 */
export interface M2cPluginResult {
  generatedCode: string;
}

export class M2cPlugin implements Plugin<M2cPluginResult> {
  static readonly pluginId = 'm2c';
  static readonly configSchema = m2cConfigSchema;

  readonly id = M2cPlugin.pluginId;
  readonly name = 'm2c';
  readonly description = 'Generates initial C decompilation using m2c';

  #m2c: M2c;

  constructor(_config: M2cConfig) {
    this.#m2c = new M2c();
  }

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<M2cPluginResult>;
    context: PipelineContext;
  }> {
    const startTime = Date.now();

    if (!context.targetObjectPath) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No target object path provided',
        },
        context,
      };
    }

    try {
      // 1. Extract assembly from target .o file using objdiff
      const objdiff = Objdiff.getInstance();
      const parsedTarget = await objdiff.parseObjectFile(context.targetObjectPath, 'base');
      const diffResult = await objdiff.runDiff(parsedTarget);

      if (!diffResult.left) {
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

      const assembly = await objdiff.getAssemblyFromSymbol(diffResult.left, context.functionName);

      // 2. Read ELF relocations for literal pool entries not visible in the objdiff display
      const literalPoolOverrides = await this.#m2c.getRelocationsForFunction(
        context.targetObjectPath,
        context.functionName,
      );

      // 3. Convert to GAS-compatible format
      const gasAssembly = M2c.convertObjdiffAsmToGas(assembly, context.functionName, literalPoolOverrides);

      // 4. Run m2c
      const m2cTarget = targetMapping[context.config.target];
      if (!m2cTarget) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: `Unsupported target platform for m2c: ${context.config.target}`,
          },
          context,
        };
      }

      const m2cResult = await this.#m2c.decompile({
        asmContent: gasAssembly,
        functionName: context.functionName,
        target: m2cTarget,
        contextPath: context.config.contextPath,
      });

      if (!m2cResult.success) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: m2cResult.error || 'm2c failed to decompile',
          },
          context,
        };
      }

      const generatedCode = m2cResult.code!;

      // 5. Set context for downstream plugins (Compiler) and for Claude Runner (if programmatic-flow fails)
      const updatedContext: PipelineContext = {
        ...context,
        generatedCode,
        m2cContext: {
          generatedCode,
        },
      };

      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'success',
          durationMs: Date.now() - startTime,
          output: `Generated ${generatedCode.split('\n').length} lines of C code`,
          data: { generatedCode },
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

  getReportSections(result: PluginResult<M2cPluginResult>): PluginReportSection[] {
    const sections: PluginReportSection[] = [];

    if (result.data?.generatedCode) {
      sections.push({
        type: 'code',
        title: 'Generated C Code',
        language: 'c',
        code: result.data.generatedCode,
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
