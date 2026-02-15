/**
 * Get Context Plugin
 *
 * Executes a user-provided shell script (`getContextScript`) to generate
 * context content (e.g., type definitions) for the compilation pipeline.
 * Runs in the setup-flow phase before both programmatic-flow and AI-powered flow.
 */
import { execSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import type { PipelineContext, Plugin, PluginReportSection, PluginResult } from '~/shared/types.js';

export interface GetContextResult {
  contextContent: string;
  contextFilePath: string;
}

export class GetContextPlugin implements Plugin<GetContextResult> {
  static readonly pluginId = 'get-context';

  readonly id = GetContextPlugin.pluginId;
  readonly name = 'Get Context';
  readonly description = 'Executes getContextScript to generate context content';

  #getContextScript: string;

  constructor(getContextScript: string) {
    this.#getContextScript = getContextScript;
  }

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<GetContextResult>;
    context: PipelineContext;
  }> {
    const startTime = Date.now();

    if (!this.#getContextScript.trim()) {
      // Empty script — no context needed
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'success',
          durationMs: Date.now() - startTime,
          output: 'No getContextScript configured, using empty context',
          data: { contextContent: '', contextFilePath: '' },
        },
        context: { ...context, contextContent: '', contextFilePath: '' },
      };
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-context-'));
    const scriptPath = path.join(tmpDir, 'get-context.sh');
    const contextFilePath = path.join(tmpDir, 'context.h');

    try {
      // Substitute template variables
      const renderedScript = this.#getContextScript
        .replaceAll('{{functionName}}', context.functionName)
        .replaceAll('{{targetObjectPath}}', context.targetObjectPath ?? '');

      await fs.writeFile(scriptPath, 'set -e\n' + renderedScript);

      const stdout = execSync(`bash "${scriptPath}"`, {
        cwd: tmpDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const contextContent = stdout.toString();

      // Write to temp file so other plugins can reference it as a path
      await fs.writeFile(contextFilePath, contextContent);

      const lineCount = contextContent.split('\n').length;
      const output = contextContent
        ? `Generated ${lineCount} lines of context`
        : 'Warning: getContextScript succeeded but produced no stdout output. If your script writes to a file (e.g., m2ctx.py writes to ctx.c), add "cat <file>" at the end of your script to pipe the content to stdout.';

      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'success',
          durationMs: Date.now() - startTime,
          output,
          data: { contextContent, contextFilePath },
        },
        context: { ...context, contextContent, contextFilePath },
      };
    } catch (error) {
      const stderr =
        error instanceof Error && 'stderr' in error && Buffer.isBuffer((error as Record<string, unknown>).stderr)
          ? ((error as Record<string, unknown>).stderr as Buffer).toString().trim()
          : '';
      const errorMessage = stderr || (error instanceof Error ? error.message : String(error));

      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: `getContextScript failed: ${errorMessage}`,
        },
        context,
      };
    }
  }

  getReportSections(result: PluginResult<GetContextResult>): PluginReportSection[] {
    const sections: PluginReportSection[] = [];

    if (result.data?.contextContent) {
      sections.push({
        type: 'code',
        title: 'Context Content',
        language: 'c',
        code: result.data.contextContent,
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
