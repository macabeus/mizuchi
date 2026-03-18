/**
 * AI-Powered Build Fixer
 *
 * When the integrator plugin's build verification fails, this module spawns a
 * Claude Agent SDK session to autonomously diagnose and fix the build errors
 * within the isolated git worktree.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { SDKQuery } from '~/shared/sdk-types.js';
import type { ChatMessage, ContentBlock, PluginStatusData, QueryFactory } from '~/shared/types.js';

const DEFAULT_MODEL = 'sonnet';

export interface BuildFixResult {
  fixed: boolean;
  chatHistory: ChatMessage[];
  systemPrompt: string;
  buildOutput: string;
}

export interface BuildFixOptions {
  worktreePath: string;
  buildError: string;
  filesModified: string[];
  functionName: string;
  generatedCode: string;
  verifyBuildCommand: string;
  timeoutMs: number;
  model?: string;
  queryFactory?: QueryFactory;
  statusCallback?: (status: PluginStatusData) => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatToolLabel(name: string, input: Record<string, unknown>): string {
  const shortName = name.replace(/^mcp__[^_]+__/, '');

  let detail: string | undefined;
  if (input.file_path) {
    detail = String(input.file_path).split('/').pop();
  } else if (input.pattern && typeof input.pattern === 'string') {
    detail = input.pattern.length > 30 ? input.pattern.slice(0, 27) + '...' : input.pattern;
  } else if (input.command && typeof input.command === 'string') {
    const cmd = input.command.trim();
    detail = cmd.length > 30 ? cmd.slice(0, 27) + '...' : cmd;
  }

  return detail ? `${shortName} ${detail}` : shortName;
}

function buildSystemPrompt(options: BuildFixOptions): string {
  const filesModifiedList = options.filesModified.map((f) => `- ${f}`).join('\n');

  return `You are fixing build errors that occurred after integrating decompiled C code into a decompilation project.

## What happened
The function \`${options.functionName}\` was successfully decompiled and its code was integrated into the project, but the build verification failed.

## Files modified during integration
${filesModifiedList}

## The code that was integrated
\`\`\`c
${options.generatedCode}
\`\`\`

## Build error output
\`\`\`
${options.buildError}
\`\`\`

## Common issues
- Duplicate extern/forward declarations (the integrated code added a declaration that already exists in the file, possibly with a different signature)
- Symbol conflicts between the new decompiled function and existing non-matching assembly
- Missing or conflicting type definitions

## Your task
1. Diagnose the build error
2. Fix the source files to resolve the error
3. Run the build to verify:
\`\`\`
${options.verifyBuildCommand}
\`\`\`
4. Only modify files that are necessary to fix the build
5. Do not change the logic of the decompiled function itself`;
}

interface CollectResponseOptions {
  queryObj: SDKQuery;
  statusCallback?: (status: PluginStatusData) => void;
  startTime: number;
  timeoutMs: number;
}

/**
 * Emit status update from accumulated content blocks.
 * Follows the same pattern as ClaudeRunnerPlugin's #emitStatus.
 */
function emitStatus(
  allBlocks: ContentBlock[],
  statusCallback: (status: PluginStatusData) => void,
  startTime: number,
  timeoutMs: number,
): void {
  const allLines: string[] = [];
  for (const block of allBlocks) {
    if (block.type === 'tool_use') {
      const hasResult = allBlocks.some((b) => b.type === 'tool_result' && b.tool_use_id === block.id);
      const bullet = hasResult ? '✓' : '▸';
      const toolLabel = formatToolLabel(block.name, block.input);
      allLines.push(`${bullet} ${toolLabel}`);
    } else if (block.type === 'text') {
      const textLines = block.text.split('\n').filter((l) => l.trim());
      for (const line of textLines) {
        allLines.push(line.length > 80 ? line.slice(0, 77) + '...' : line);
      }
    }
  }

  const logLines = allLines.slice(-3);
  const elapsed = Date.now() - startTime;
  const timeValue = `${formatMs(elapsed)} / ${formatMs(timeoutMs)}`;

  statusCallback({ logLines, stats: [{ label: '', value: timeValue }] });
}

/**
 * Collect response from the SDK stream, following the same pattern as
 * ClaudeRunnerPlugin's #collectResponse.
 *
 * Returns { text, contentBlocks } — the caller builds conversation history
 * from these, matching the claude-runner pattern:
 *   { role: 'user', content: prompt }
 *   { role: 'assistant', content: hasToolCalls ? contentBlocks : text }
 */
async function collectResponse(opts: CollectResponseOptions): Promise<{ text: string; contentBlocks: ContentBlock[] }> {
  const { queryObj, statusCallback, startTime, timeoutMs } = opts;
  let responseText = '';
  const contentBlocks: ContentBlock[] = [];

  // Periodic status timer (updates elapsed time even when no new messages arrive)
  let statusTimerId: ReturnType<typeof setInterval> | undefined;
  if (statusCallback) {
    emitStatus(contentBlocks, statusCallback, startTime, timeoutMs);
    statusTimerId = setInterval(() => {
      emitStatus(contentBlocks, statusCallback, startTime, timeoutMs);
    }, 1000);
  }

  try {
    for await (const msg of queryObj) {
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            responseText += block.text;
            contentBlocks.push({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use' && 'id' in block && 'name' in block && 'input' in block) {
            contentBlocks.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }
      } else if (msg.type === 'user' && msg.message?.content) {
        // Tool results come as user messages in the SDK stream,
        // but are included in the assistant's content blocks for the report
        for (const block of msg.message.content) {
          if (block.type === 'tool_result' && 'tool_use_id' in block) {
            contentBlocks.push({
              type: 'tool_result',
              tool_use_id: block.tool_use_id,
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            });
          }
        }
      } else if (msg.type === 'result') {
        if (msg.subtype && msg.subtype !== 'success') {
          const errors = msg.errors ? msg.errors.join(', ') : 'Unknown error';
          throw new Error(`Claude error (${msg.subtype}): ${errors}`);
        }
      }

      // Emit live status update after each message
      if (statusCallback) {
        emitStatus(contentBlocks, statusCallback, startTime, timeoutMs);
      }
    }
  } finally {
    if (statusTimerId) {
      clearInterval(statusTimerId);
    }
  }

  return { text: responseText, contentBlocks };
}

/**
 * Attempt to fix build errors using a Claude Agent SDK session.
 *
 * Spawns a single agentic query with filesystem and shell tools, letting Claude
 * autonomously diagnose and fix the build within the worktree.
 */
export async function attemptBuildFix(options: BuildFixOptions): Promise<BuildFixResult> {
  const systemPrompt = buildSystemPrompt(options);
  const conversationHistory: ChatMessage[] = [];
  const startTime = Date.now();
  const userPrompt = 'Please fix the build errors described above.';

  try {
    let createQuery = options.queryFactory;
    if (!createQuery) {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      createQuery = (prompt: string, queryOptions: { model?: string }) =>
        query({
          prompt,
          options: {
            systemPrompt,
            model: queryOptions.model || options.model || DEFAULT_MODEL,
            allowedTools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],
            permissionMode: 'dontAsk',
            cwd: options.worktreePath,
          },
        });
    }

    const queryObj = createQuery(userPrompt, {
      model: options.model || DEFAULT_MODEL,
    }) as SDKQuery;

    // Set up timeout to close the query
    const timeoutId = setTimeout(() => {
      queryObj.close();
    }, options.timeoutMs);

    try {
      const { text, contentBlocks } = await collectResponse({
        queryObj,
        statusCallback: options.statusCallback,
        startTime,
        timeoutMs: options.timeoutMs,
      });

      // Build conversation history following the claude-runner pattern:
      // { user: prompt }, { assistant: contentBlocks | text }
      const hasToolCalls = contentBlocks.some((b) => b.type === 'tool_use' || b.type === 'tool_result');
      conversationHistory.push(
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: hasToolCalls ? contentBlocks : text },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // If we already have partial content, keep it; add the error
    if (conversationHistory.length === 0) {
      conversationHistory.push({ role: 'user', content: userPrompt });
    }
    conversationHistory.push({ role: 'error', content: `Build fix error: ${errorMessage}` });
  }

  // Run a final verification build to confirm the fix
  const buildOutput = runVerifyBuild(options.worktreePath, options.verifyBuildCommand);

  return {
    fixed: buildOutput.passed,
    chatHistory: conversationHistory,
    systemPrompt,
    buildOutput: buildOutput.output,
  };
}

function runVerifyBuild(worktreePath: string, verifyBuildCommand: string): { passed: boolean; output: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuchi-buildfixer-'));
  const scriptPath = path.join(tmpDir, 'verify-build.sh');
  fs.writeFileSync(scriptPath, 'set -e\n' + verifyBuildCommand);

  try {
    const result = execSync(`bash "${scriptPath}"`, {
      cwd: worktreePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
    });
    return { passed: true, output: result.toString() };
  } catch (error) {
    let output = '';
    if (error instanceof Error && 'stderr' in error) {
      const stderr = (error as Record<string, unknown>).stderr;
      const stdout = (error as Record<string, unknown>).stdout;
      output = [stdout instanceof Buffer ? stdout.toString() : '', stderr instanceof Buffer ? stderr.toString() : '']
        .filter(Boolean)
        .join('\n');
    } else {
      output = error instanceof Error ? error.message : String(error);
    }
    return { passed: false, output };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
