/**
 * Compiler Plugin
 *
 * Compiles generated C code using the agbcc compiler via compile.sh.
 * Handles file writing, compilation, and cleanup.
 */
import fs from 'fs/promises';
import { z } from 'zod';

import { CCompiler } from '~/shared/c-compiler/c-compiler.js';
import { PipelineConfig } from '~/shared/config';
import type { PipelineContext, Plugin, PluginReportSection, PluginResult } from '~/shared/types.js';

/**
 * Configuration schema for CompilerPlugin
 */
export const compilerConfigSchema = z.object({});

export type CompilerConfig = z.infer<typeof compilerConfigSchema>;

/**
 * Compiler Plugin result data
 */
export interface CompilerResult {
  objectFilePath: string;
}

/**
 * Compiler Plugin
 */
export class CompilerPlugin implements Plugin<CompilerResult> {
  static readonly pluginId = 'compiler';
  static readonly configSchema = compilerConfigSchema;

  readonly id = CompilerPlugin.pluginId;
  readonly name = 'Compiler';
  readonly description = 'Compiles a C code';

  #cCompiler: CCompiler;
  #objectFilePath?: string = undefined;
  #flags: string;

  constructor(_config: CompilerConfig, pipelineConfig: PipelineConfig) {
    this.#cCompiler = new CCompiler();
    this.#flags = pipelineConfig.compilerFlags;
  }

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<CompilerResult>;
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
          error: 'No generated code to compile',
        },
        context,
      };
    }

    const compileResult = await this.#cCompiler.compile(
      context.functionName,
      context.generatedCode,
      context.config.contextPath,
      this.#flags,
    );
    if (!compileResult.success) {
      const outputError = compileResult.compilationErrors.length
        ? compileResult.compilationErrors.map((err) => `${err.line}: ${err.message}`).join('\n')
        : compileResult.errorMessage;

      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'Compilation failed',
          output: outputError,
        },
        context,
      };
    }

    // Verify object file exists
    this.#objectFilePath = compileResult.objPath;

    try {
      await fs.access(this.#objectFilePath);
    } catch {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'Object file not created after compilation',
        },
        context,
      };
    }

    return {
      result: {
        pluginId: this.id,
        pluginName: this.name,
        status: 'success',
        durationMs: Date.now() - startTime,
        output: `Successfully compiled to ${this.#objectFilePath}`,
        data: { objectFilePath: this.#objectFilePath },
      },
      context: { ...context, compiledObjectPath: this.#objectFilePath },
    };
  }

  /**
   * Clean up generated object files
   */
  async cleanup(): Promise<void> {
    if (this.#objectFilePath) {
      try {
        await fs.unlink(this.#objectFilePath);
      } catch {
        // Ignore errors
      }
    }
  }

  getReportSections(result: PluginResult<CompilerResult>, context: PipelineContext): PluginReportSection[] {
    const sections: PluginReportSection[] = [];

    // Show the source code that was compiled
    if (context.generatedCode) {
      sections.push({
        type: 'code',
        title: 'Source Code',
        language: 'c',
        code: context.generatedCode,
      });
    }

    // Show compilation output/error
    if (result.output) {
      sections.push({
        type: 'code',
        title: result.status === 'success' ? 'Compilation Output' : 'Compilation Error',
        language: 'text',
        code: result.output,
      });
    }

    return sections;
  }
}
