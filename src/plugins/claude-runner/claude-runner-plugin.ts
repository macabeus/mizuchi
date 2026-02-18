/**
 * Claude Runner Plugin
 *
 * Uses Claude Agent SDK V2 to generate C code from assembly prompts.
 * Maintains session continuity across retry attempts within a pipeline run.
 *
 * Cache uses a conversation tree structure to track multi-turn interactions.
 */
import { SDKAssistantMessageError, createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

import { CCompiler } from '~/shared/c-compiler/c-compiler.js';
import type { CliPrompt } from '~/shared/cli-prompt.js';
import { PipelineConfig } from '~/shared/config';
import { PipelineAbortError, UsageLimitError } from '~/shared/errors.js';
import { Objdiff } from '~/shared/objdiff.js';
import type {
  ChatMessage,
  ContentBlock,
  PipelineContext,
  Plugin,
  PluginReportSection,
  PluginResult,
  PluginResultMap,
} from '~/shared/types.js';

/**
 * Query interface from the SDK
 */
interface Query {
  [Symbol.asyncIterator](): AsyncIterator<SDKMessage>;
  close(): void;
}

/**
 * SDK content block types
 */
interface SDKTextBlock {
  type: 'text';
  text: string;
}

interface SDKToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface SDKToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

type SDKContentBlock = SDKTextBlock | SDKToolUseBlock | SDKToolResultBlock | { type: string; text?: string };

/**
 * SDK message types from the V2 SDK
 */
interface SDKMessage {
  type: 'assistant' | 'result' | 'user' | string;
  session_id?: string;
  message?: {
    id?: string;
    content: SDKContentBlock[];
  };
  subtype?: string;
  errors?: string[];
  error?: SDKAssistantMessageError;
}

/**
 * MCP Server type from the SDK
 */
type McpServer = ReturnType<typeof createSdkMcpServer>;

/**
 * Query factory type for dependency injection (enables testing)
 */
export type QueryFactory = (prompt: string, options: { model?: string; resume?: string }) => Query;

/**
 * Conversation node in the cache tree
 */
interface ConversationNode {
  response: string;
  timestamp: string;
  sessionId: string; // Session ID for resuming conversations
  lastMessageId: string; // Message UUID for resuming at specific point
  followUpMessages: Record<string, ConversationNode>; // keyed by follow-up prompt hash
}

/**
 * Cache file structure - conversation tree format
 */
interface ConversationCache {
  version: number; // Version 3 for conversation tree format
  conversations: Record<string, ConversationNode>; // keyed by initial prompt hash
}

/**
 * Configuration schema for ClaudeRunnerPlugin
 */
export const claudeRunnerConfigSchema = z.object({
  projectPath: z.string().optional().describe('Path to the Claude Agent read the project codebase from'),
  timeoutMs: z.number().positive().default(600_000).describe('Timeout in milliseconds for Claude requests'),
  cachePath: z.string().optional().describe('Path to JSON cache file for response caching'),
  model: z.string().optional().describe('Claude model to use'),
  systemPrompt: z
    .string()
    .describe('System prompt template for Claude. Template variables: {{contextFilePath}}, {{promptContent}}'),
  kickoffMessage: z.string().describe('First user message sent to Claude to start the conversation'),
  stallThreshold: z
    .number()
    .int()
    .positive()
    .default(3)
    .describe('Number of consecutive attempts without improvement before triggering stall recovery guidance'),
  toolCallLimit: z
    .number()
    .int()
    .positive()
    .default(7)
    .describe('Maximum number of compile_and_view_assembly tool calls allowed per retry iteration'),
});

export type ClaudeRunnerConfig = z.infer<typeof claudeRunnerConfigSchema>;

const DEFAULT_CACHE_PATH = 'claude-cache.json';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const CACHE_VERSION = 2;

/**
 * Hash a prompt to create a cache key
 */
function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}

/**
 * Build a follow-up prompt for retry attempts (simpler than V1 since session has context)
 */
function buildFollowUpPrompt(
  error: string,
  isCompilationError: boolean,
  lastCode: string,
  expectedFunctionName: string,
  reminderPreviousAttempt: { code: string; mismatchesCount: number } | undefined,
): string {
  let prompt = '';

  if (error === 'Could not extract C code from response') {
    return 'Your last response did not contain any C code. Please provide only the C code in a single code block using ```c and ``` markers.';
  }

  if (isCompilationError) {
    prompt += `The code you provided:

\`\`\`c
${lastCode}
\`\`\`
    
failed to compile with this error:

\`\`\`
${error}
\`\`\`

Please fix the compilation errors and provide the corrected code.

# Rules

- Write the full code again, do not just provide snippets
`;
  } else if (error.includes('Assembly mismatch')) {
    prompt += `The code compiles but doesn't match the target assembly. Here's the diff:

${error}

# Rules

- Update the C code to match perfectly against the target assembly
- Make incremental changes to preserve working parts
`;
  } else {
    prompt += `The code compiles but it failed when trying to match the target assembly. Here is the error message:

${error}

# Rules

- Your C code should have exactly only one C function named \`${expectedFunctionName}\`
`;
  }

  if (reminderPreviousAttempt) {
    prompt += `

Reminder: You previously provided this code that worked partially with ${reminderPreviousAttempt.mismatchesCount} mismatches

\`\`\`c
${reminderPreviousAttempt.code}
\`\`\`
`;
  }

  return prompt;
}

/**
 * Detect if the pipeline is stalled (no improvement in differenceCount
 * over the last `stallThreshold` consecutive attempts with objdiff results).
 *
 * Returns the stall recovery message to append, or undefined if not stalled.
 */
function detectStall(previousAttempts: Array<Partial<PluginResultMap>>, stallThreshold: number): string | undefined {
  const differenceCounts: number[] = [];
  for (const attempt of previousAttempts) {
    if (attempt.objdiff?.data?.differenceCount !== undefined) {
      differenceCounts.push(attempt.objdiff.data.differenceCount);
    }
  }

  if (differenceCounts.length < stallThreshold) {
    return undefined;
  }

  const window = differenceCounts.slice(-stallThreshold);
  const oldest = window[0];
  const newest = window[window.length - 1];

  if (newest >= oldest) {
    return (
      `\n\nYour last ${stallThreshold} attempts have not improved the match rate. ` +
      `You appear to be stuck in a loop, repeating similar approaches that aren't working. ` +
      `Step back and try a fundamentally different strategy. Consider: restructuring the logic, ` +
      `changing variable types or control flow, reordering operations, or rewriting the function ` +
      `from scratch using an alternative approach.`
    );
  }

  return undefined;
}

/**
 * Build a section injecting m2c decompilation context into the initial prompt
 */
function buildM2cContextSection(m2cContext: NonNullable<PipelineContext['m2cContext']>): string {
  let section = `

## Initial Decompilation
Here is an initial decompilation attempt. Use it as a starting point and improve upon it.

\`\`\`c
${m2cContext.generatedCode}
\`\`\`
`;

  if (m2cContext.compilationError) {
    section += `
## Matching Result
The initial decompilation failed to compile with this error:

\`\`\`
${m2cContext.compilationError}
\`\`\`
`;
  } else if (m2cContext.objdiffOutput) {
    section += `
## Matching Result
${m2cContext.objdiffOutput}
`;
  }

  return section;
}

/**
 * Extract C code from LLM response
 */
function extractCCode(response: string): string | undefined {
  // Extract the last markdown code block
  const codeBlockRegex = /```(?:c|C)\n([\s\S]*?)```/g;
  const matches: string[] = [];

  let match;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    matches.push(match[1].trim());
  }

  // Return the last code block
  return matches.at(-1);
}

/**
 * Validate that the extracted code looks like valid C
 */
function validateCCode(code: string): { valid: boolean; error?: string } {
  if (!code || code.trim().length === 0) {
    return { valid: false, error: 'Empty code' };
  }

  const hasOpenBrace = code.includes('{');
  const hasCloseBrace = code.includes('}');

  if (!hasOpenBrace || !hasCloseBrace) {
    return { valid: false, error: 'Missing braces - incomplete code' };
  }

  const openCount = (code.match(/\{/g) || []).length;
  const closeCount = (code.match(/\}/g) || []).length;

  if (openCount !== closeCount) {
    return {
      valid: false,
      error: `Unbalanced braces: ${openCount} open, ${closeCount} close`,
    };
  }

  const hasFunctionPattern = /\w+\s+\w+\s*\([^)]*\)\s*\{/.test(code);
  if (!hasFunctionPattern) {
    return { valid: false, error: 'No function definition found' };
  }

  return { valid: true };
}

/**
 * Claude Runner Plugin result data
 */
export interface ClaudeRunnerResult {
  generatedCode: string;
  rawResponse?: string;
  promptSent?: string;
  codeLength?: number;
  fromCache: boolean;
  stallDetected: boolean;
}

/**
 * Claude Runner Plugin
 */
export class ClaudeRunnerPlugin implements Plugin<ClaudeRunnerResult> {
  static readonly pluginId = 'claude-runner';
  static readonly configSchema = claudeRunnerConfigSchema;

  readonly id = ClaudeRunnerPlugin.pluginId;
  readonly name = 'Claude Runner';
  readonly description = 'Uses Claude Agent SDK to generate C code from assembly';

  systemPrompt = '';

  #systemPromptTemplate: string;
  #config: ClaudeRunnerConfig;
  #feedbackPrompt?: string;
  #stallDetected = false;
  #lastStallAttemptIndex = -1;
  #queryFactory: QueryFactory;
  #cache: ConversationCache | null = null;
  #cacheLoaded: boolean = false;
  #cachePath: string;
  #cacheModified: boolean = false;

  // Session state (per pipeline run)
  #currentQuery: Query | null = null;
  #sessionId: string | null = null;
  #lastMessageId: string | null = null;
  #conversationHistory: ChatMessage[] = [];
  #initialPromptHash: string | null = null;
  #currentCacheNode: ConversationNode | null = null;

  // Tool call counter (resets each retry iteration)
  #toolCallCount = 0;

  // MCP tool dependencies
  #currentContextContent = '';
  #cCompiler: CCompiler;
  #objdiff: Objdiff;
  #mcpServer: McpServer;
  #cliPrompt?: CliPrompt;

  constructor({
    config,
    pipelineConfig,
    cCompiler,
    objdiff,
    queryFactory,
    cliPrompt,
  }: {
    config: ClaudeRunnerConfig;
    pipelineConfig: PipelineConfig;
    cCompiler: CCompiler;
    objdiff: Objdiff;
    queryFactory?: QueryFactory;
    cliPrompt?: CliPrompt;
  }) {
    this.#systemPromptTemplate = config.systemPrompt;

    this.#config = config;
    this.#cCompiler = cCompiler;
    this.#objdiff = objdiff;

    this.#mcpServer = this.#createMcpServer();

    this.#queryFactory =
      queryFactory ||
      ((prompt, options) =>
        query({
          prompt,
          ...(options.resume ? { resume: options.resume } : {}),
          options: {
            systemPrompt: this.systemPrompt,
            model: options.model || DEFAULT_MODEL,
            allowedTools: ['Read', 'Glob', 'Grep', 'mcp__mizuchi__compile_and_view_assembly'],
            permissionMode: 'dontAsk',
            cwd: config.projectPath,
            mcpServers: {
              mizuchi: this.#mcpServer,
            },
          },
        }) as unknown as Query);

    this.#cliPrompt = cliPrompt;

    // Resolve cache path relative to output directory or current directory
    const baseDir = pipelineConfig?.outputDir || process.cwd();
    this.#cachePath = path.resolve(baseDir, config.cachePath || DEFAULT_CACHE_PATH);
  }

  /**
   * Create the MCP server for the Mizuchi tools
   */
  #createMcpServer(): McpServer {
    return createSdkMcpServer({
      name: 'mizuchi',
      version: '1.0.0',
      tools: [
        tool(
          'compile_and_view_assembly',
          "Compile C code and view the resulting assembly. Use this to test how your C code compiles before submitting the final result. This helps to learn the compiler's behavior and iterate on the code to match the target assembly.",
          {
            code: z.string().describe('The C code to compile'),
            function_name: z.string().describe('The name of the function to extract assembly for'),
          },
          (args) => this.handleCompileAndViewAssembly(args),
        ),
      ],
    });
  }

  /**
   * Handle a compile_and_view_assembly tool call.
   * Compiles C code, extracts assembly, and enforces the per-turn call limit.
   */
  async handleCompileAndViewAssembly(args: { code: string; function_name: string }) {
    // Enforce tool call limit
    if (this.#toolCallCount >= this.#config.toolCallLimit) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Tool call limit reached (${this.#config.toolCallLimit}/${this.#config.toolCallLimit}). You must now submit your final answer with the best code you have.`,
          },
        ],
      };
    }

    this.#toolCallCount++;
    const remaining = this.#config.toolCallLimit - this.#toolCallCount;
    const callWarning = `\n\n⚠ Tool calls remaining: ${remaining}/${this.#config.toolCallLimit}. You must submit your answer before running out of calls.`;

    let compileResult: Awaited<ReturnType<CCompiler['compile']>> | undefined;
    try {
      // Compile the code
      compileResult = await this.#cCompiler.compile(args.function_name, args.code, this.#currentContextContent);

      if (!compileResult.success) {
        const errorOutput = compileResult.compilationErrors.length
          ? compileResult.compilationErrors.map((err) => `Line ${err.line}: ${err.message}`).join('\n')
          : compileResult.errorMessage;

        return {
          content: [
            {
              type: 'text' as const,
              text: `Compilation failed:\n\n${errorOutput}${callWarning}`,
            },
          ],
        };
      }

      // Parse the object file and extract assembly
      const parsedObject = await this.#objdiff.parseObjectFile(compileResult.objPath, 'base');
      const diffResult = await this.#objdiff.runDiff(parsedObject);

      if (!diffResult.left) {
        // Clean up the object file
        await fs.unlink(compileResult.objPath).catch(() => {});
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to parse compiled object file${callWarning}`,
            },
          ],
        };
      }

      // Check if the symbol exists
      const symbol = diffResult.left.findSymbol(args.function_name, undefined);
      if (!symbol) {
        const availableSymbols = await this.#objdiff.getSymbolNames(parsedObject);
        // Clean up the object file
        await fs.unlink(compileResult.objPath).catch(() => {});
        return {
          content: [
            {
              type: 'text' as const,
              text: `Symbol '${args.function_name}' not found in compiled object.\n\nAvailable symbols: ${availableSymbols.join(', ')}\n\nMake sure your function is named exactly '${args.function_name}'.${callWarning}`,
            },
          ],
        };
      }

      // Get the assembly
      const assembly = await this.#objdiff.getAssemblyFromSymbol(diffResult.left, args.function_name);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Compilation successful!\n\nAssembly for '${args.function_name}':\n\`\`\`asm\n${assembly}\n\`\`\`${callWarning}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}${callWarning}`,
          },
        ],
      };
    } finally {
      // Clean up the object file
      if (compileResult?.success) {
        await fs.unlink(compileResult.objPath).catch(() => {});
      }
    }
  }

  /**
   * Load cache from file
   */
  async #loadCache(): Promise<void> {
    if (this.#cacheLoaded) {
      return;
    }

    try {
      const content = await fs.readFile(this.#cachePath, 'utf-8');
      const parsed = JSON.parse(content);
      this.#cache = parsed as ConversationCache;
      this.#cacheLoaded = true;
    } catch {
      // Cache file doesn't exist yet, start with empty cache
      this.#cache = { version: CACHE_VERSION, conversations: {} };
      this.#cacheLoaded = true;
    }
  }

  /**
   * Get cached conversation for initial prompt
   */
  #getCachedConversation(promptHash: string): ConversationNode | null {
    if (!this.#cache) {
      return null;
    }
    return this.#cache.conversations[promptHash] ?? null;
  }

  /**
   * Add conversation to cache
   */
  #addConversationToCache(promptHash: string, node: ConversationNode): void {
    if (!this.#cache) {
      return;
    }
    this.#cache.conversations[promptHash] = node;
    this.#cacheModified = true;
  }

  /**
   * Save cache to file (called after benchmark completes)
   */
  async saveCache(): Promise<void> {
    if (!this.#cache || !this.#cacheModified) {
      return;
    }

    await fs.writeFile(this.#cachePath, JSON.stringify(this.#cache, null, 2), 'utf-8');
  }

  /**
   * Collect response from query stream
   */
  async #collectResponse(queryObj: Query): Promise<{ text: string; contentBlocks: ContentBlock[] }> {
    let responseText = '';
    const contentBlocks: ContentBlock[] = [];
    let lastAssistantError: SDKAssistantMessageError | undefined;

    for await (const msg of queryObj) {
      if (msg.type === 'system' && msg.session_id) {
        this.#sessionId = msg.session_id;
      } else if (msg.type === 'assistant') {
        // Track error type from assistant messages (e.g., 'rate_limit', 'billing_error')
        if (msg.error) {
          lastAssistantError = msg.error;
        }

        if (msg.message?.content) {
          if (msg.message.id) {
            this.#lastMessageId = msg.message.id;
          }
          for (const block of msg.message.content) {
            if (block.type === 'text' && 'text' in block && block.text) {
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
        }
      } else if (msg.type === 'user' && msg.message?.content) {
        // Tool results come as user messages
        for (const block of msg.message.content) {
          if (block.type === 'tool_result' && 'tool_use_id' in block && 'content' in block) {
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

          // Detect usage limit errors (plan-level rate limit or billing error)
          if (lastAssistantError === 'rate_limit' || lastAssistantError === 'billing_error') {
            throw new UsageLimitError(errors);
          }

          throw new Error(`Claude error (${msg.subtype}): ${errors}`);
        }
      }
    }
    return { text: responseText, contentBlocks };
  }

  /**
   * Run a query for initial attempt
   */
  async #runInitialQuery(): Promise<{ response: string; fromCache: boolean }> {
    // Cache key is based on the system prompt (which includes the task content)
    this.#initialPromptHash = hashPrompt(this.systemPrompt);

    // Check cache for initial prompt
    const cachedConversation = this.#getCachedConversation(this.#initialPromptHash);
    if (cachedConversation) {
      this.#currentCacheNode = cachedConversation;
      this.#sessionId = cachedConversation.sessionId;
      this.#lastMessageId = cachedConversation.lastMessageId;
      this.#conversationHistory = [
        { role: 'user', content: this.#config.kickoffMessage },
        { role: 'assistant', content: cachedConversation.response },
      ];
      return { response: cachedConversation.response, fromCache: true };
    }

    // Create new query with timeout
    const model = this.#config.model || DEFAULT_MODEL;
    this.#currentQuery = this.#queryFactory(this.#config.kickoffMessage, { model });

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
      if (this.#currentQuery) {
        this.#currentQuery.close();
        this.#currentQuery = null;
      }
    }, this.#config.timeoutMs);

    try {
      const { text, contentBlocks } = await this.#collectResponse(this.#currentQuery);

      // Update state with content blocks if there are tool calls, otherwise use plain text
      const hasToolCalls = contentBlocks.some((b) => b.type === 'tool_use' || b.type === 'tool_result');
      this.#conversationHistory = [
        { role: 'user', content: this.#config.kickoffMessage },
        { role: 'assistant', content: hasToolCalls ? contentBlocks : text },
      ];

      // Initialize cache node with session data for resumption
      if (!this.#sessionId || !this.#lastMessageId) {
        throw new Error('Failed to capture session ID or message ID from Claude response');
      }
      this.#currentCacheNode = {
        response: text,
        timestamp: new Date().toISOString(),
        sessionId: this.#sessionId,
        lastMessageId: this.#lastMessageId,
        followUpMessages: {},
      };
      this.#addConversationToCache(this.#initialPromptHash, this.#currentCacheNode);

      return { response: text, fromCache: false };
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error(`Claude timed out after ${this.#config.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (this.#currentQuery) {
        this.#currentQuery.close();
        this.#currentQuery = null;
      }
    }
  }

  /**
   * Continue conversation with follow-up query
   */
  async #runFollowUpQuery(followUpPrompt: string): Promise<{ response: string; fromCache: boolean }> {
    const followUpHash = hashPrompt(followUpPrompt);

    // Check cache for this follow-up
    if (this.#currentCacheNode?.followUpMessages[followUpHash]) {
      const cached = this.#currentCacheNode.followUpMessages[followUpHash];
      this.#currentCacheNode = cached;
      // Restore session state from cache for further continuation
      this.#sessionId = cached.sessionId;
      this.#lastMessageId = cached.lastMessageId;
      this.#conversationHistory.push(
        { role: 'user', content: followUpPrompt },
        { role: 'assistant', content: cached.response },
      );
      return { response: cached.response, fromCache: true };
    }

    if (!this.#sessionId) {
      throw new Error('No session ID for continuation');
    }

    // Resume the session with the follow-up prompt
    // Note: Currently the SDK only supports resuming from the latest message via session ID.
    // The lastMessageId is stored for future SDK support of message-level resumption.
    const model = this.#config.model || DEFAULT_MODEL;
    this.#currentQuery = this.#queryFactory(followUpPrompt, { model, resume: this.#sessionId! });

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
      if (this.#currentQuery) {
        this.#currentQuery.close();
        this.#currentQuery = null;
      }
    }, this.#config.timeoutMs);

    try {
      const { text, contentBlocks } = await this.#collectResponse(this.#currentQuery);

      // Update conversation history with content blocks if there are tool calls
      const hasToolCalls = contentBlocks.some((b) => b.type === 'tool_use' || b.type === 'tool_result');
      this.#conversationHistory.push(
        { role: 'user', content: followUpPrompt },
        { role: 'assistant', content: hasToolCalls ? contentBlocks : text },
      );

      if (!this.#sessionId || !this.#lastMessageId) {
        throw new Error('Failed to capture session ID or message ID from Claude response');
      }

      const newNode: ConversationNode = {
        response: text,
        timestamp: new Date().toISOString(),
        sessionId: this.#sessionId,
        lastMessageId: this.#lastMessageId,
        followUpMessages: {},
      };
      if (this.#currentCacheNode) {
        this.#currentCacheNode.followUpMessages[followUpHash] = newNode;
      }
      this.#currentCacheNode = newNode;
      this.#cacheModified = true;

      return { response: text, fromCache: false };
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error(`Claude timed out after ${this.#config.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (this.#currentQuery) {
        this.#currentQuery.close();
        this.#currentQuery = null;
      }
    }
  }

  /**
   * Reset state for new pipeline run
   */
  #resetState(): void {
    if (this.#currentQuery) {
      this.#currentQuery.close();
    }
    this.#currentQuery = null;
    this.#sessionId = null;
    this.#lastMessageId = null;
    this.#conversationHistory = [];
    this.#initialPromptHash = null;
    this.#currentCacheNode = null;
    this.#lastStallAttemptIndex = -1;
  }

  /**
   * Run the appropriate query (initial or follow-up) based on current state.
   */
  async #executeQuery(
    context: PipelineContext,
    promptContent: string,
  ): Promise<{ response: string; fromCache: boolean; promptUsed: string }> {
    if (this.#feedbackPrompt) {
      const promptUsed = this.#feedbackPrompt;
      const result = await this.#runFollowUpQuery(this.#feedbackPrompt);
      this.#feedbackPrompt = undefined;
      return { response: result.response, fromCache: result.fromCache, promptUsed };
    }

    // Initial attempt: run new query
    this.#resetState();

    // Build system prompt by resolving template variables
    this.systemPrompt = this.#systemPromptTemplate
      .replaceAll('{{contextFilePath}}', context.contextFilePath ?? '')
      .replaceAll('{{promptContent}}', promptContent);

    const result = await this.#runInitialQuery();
    return { response: result.response, fromCache: result.fromCache, promptUsed: this.#config.kickoffMessage };
  }

  /**
   * Wrap a query with usage-limit pause/resume handling.
   * On UsageLimitError, prompts the user to continue or abort.
   * On "continue", recursively retries. On "abort", throws PipelineAbortError.
   */
  async #executeQueryWithUsageLimitHandling(
    context: PipelineContext,
    promptContent: string,
  ): Promise<{ response: string; fromCache: boolean; promptUsed: string }> {
    try {
      return await this.#executeQuery(context, promptContent);
    } catch (error) {
      if (error instanceof UsageLimitError && this.#cliPrompt) {
        const attemptInfo = `attempt ${context.attemptNumber}/${context.maxRetries}`;
        const message =
          `API plan usage limit reached while processing "${context.functionName}" (${attemptInfo}).\n` +
          `  ${error.message}\n` +
          `  Wait for the limit to reset, then choose an option:`;

        const choice = await this.#cliPrompt.askChoice(message, [
          { label: 'Continue', value: 'continue' },
          { label: 'Abort', value: 'abort' },
        ]);

        if (choice === 'abort') {
          throw new PipelineAbortError();
        }

        return this.#executeQueryWithUsageLimitHandling(context, promptContent);
      }
      throw error;
    }
  }

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<ClaudeRunnerResult>;
    context: PipelineContext;
  }> {
    const startTime = Date.now();

    // Reset tool call counter for this turn
    this.#toolCallCount = 0;

    let { promptContent } = context;
    if (!promptContent) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No prompt content provided',
        },
        context,
      };
    }

    try {
      // Update context content for MCP tool
      this.#currentContextContent = context.contextContent ?? '';

      // Load cache on first execution
      await this.#loadCache();

      // Enhance prompt with context from programmatic-flow if available
      if (context.m2cContext) {
        promptContent += buildM2cContextSection(context.m2cContext);
      }

      const { response, fromCache, promptUsed } = await this.#executeQueryWithUsageLimitHandling(
        context,
        promptContent,
      );

      // Extract code
      const code = extractCCode(response);

      if (!code) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: 'Could not extract C code from response',
            output: `Raw response (first 500 chars):\n${response.substring(0, 500)}...`,
            data: {
              rawResponse: response,
              promptSent: promptUsed,
              fromCache,
              generatedCode: '',
              stallDetected: this.#stallDetected,
            },
          },
          context,
        };
      }

      // Validate code
      const validation = validateCCode(code);
      if (!validation.valid) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: `Invalid code structure: ${validation.error}`,
            output: `Generated code:\n${code}`,
            data: {
              generatedCode: code,
              rawResponse: response,
              promptSent: promptUsed,
              fromCache,
              stallDetected: this.#stallDetected,
            },
          },
          context: { ...context, generatedCode: code },
        };
      }

      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'success',
          durationMs: Date.now() - startTime,
          output: fromCache
            ? `[CACHE HIT] Replayed ${code.split('\n').length} lines of C code`
            : `Generated ${code.split('\n').length} lines of C code`,
          data: {
            generatedCode: code,
            rawResponse: response,
            promptSent: promptUsed,
            codeLength: code.length,
            fromCache,
            stallDetected: this.#stallDetected,
          },
        },
        context: { ...context, generatedCode: code },
      };
    } catch (error) {
      // PipelineAbortError must propagate to PluginManager for graceful shutdown
      if (error instanceof PipelineAbortError) {
        throw error;
      }

      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
          data: { fromCache: false, generatedCode: '', stallDetected: this.#stallDetected },
        },
        context,
      };
    }
  }

  prepareRetry(context: PipelineContext, previousAttempts: Array<Partial<PluginResultMap>>): PipelineContext {
    // Find the last attempt's results
    const lastAttempt = previousAttempts.at(-1);
    if (!lastAttempt) {
      return context;
    }

    // Access plugin results by their type keys
    const claudeResult = lastAttempt['claude-runner'];
    const compilerResult = lastAttempt.compiler;
    const objdiffResult = lastAttempt.objdiff;

    if (!claudeResult) {
      return context;
    }

    // Find the attempt with the fewest mismatches
    const attemptWithFewestMismatches = previousAttempts.reduce(
      (best, current) => {
        // Skip attempts where compiler didn't succeed or objdiff has no difference count
        if (current.compiler?.status !== 'success' || current.objdiff?.data?.differenceCount === undefined) {
          return best;
        }

        if (best === null) {
          return current;
        }

        const currentDiffCount = current.objdiff?.data?.differenceCount ?? Infinity;
        const bestDiffCount = best.objdiff?.data?.differenceCount ?? Infinity;

        // Return current if it has fewer mismatches than best
        if (currentDiffCount < bestDiffCount) {
          return current;
        }

        return best;
      },
      null as Partial<PluginResultMap> | null,
    );

    const lastAttemptIsWorse =
      attemptWithFewestMismatches &&
      (objdiffResult?.data?.differenceCount === undefined ||
        attemptWithFewestMismatches.objdiff!.data!.differenceCount < objdiffResult.data.differenceCount);

    const reminderPreviousAttempt = lastAttemptIsWorse
      ? {
          code: attemptWithFewestMismatches['claude-runner']!.data!.generatedCode,
          mismatchesCount: attemptWithFewestMismatches.objdiff!.data!.differenceCount,
        }
      : undefined;

    // Determine error type and build feedback
    let error = '';
    let isCompilationError = false;

    if (compilerResult?.status === 'failure') {
      // Use output for detailed error message, fall back to error field
      error = compilerResult.output || compilerResult.error || 'Unknown compilation error';
      isCompilationError = true;
    } else if (objdiffResult?.status === 'failure') {
      error = objdiffResult.output || objdiffResult.error || 'Assembly mismatch';
      isCompilationError = false;
    } else {
      error = claudeResult.error || 'Unknown error';
      isCompilationError = true;
    }

    // Build follow-up prompt
    this.#feedbackPrompt = buildFollowUpPrompt(
      error,
      isCompilationError,
      claudeResult.data!.generatedCode,
      context.functionName,
      reminderPreviousAttempt,
    );

    // Detect stall and append recovery guidance if needed.
    const attemptsSinceLastStall = previousAttempts.slice(this.#lastStallAttemptIndex + 1);
    const stallMessage = detectStall(attemptsSinceLastStall, this.#config.stallThreshold);
    this.#stallDetected = stallMessage !== undefined;
    if (stallMessage) {
      this.#feedbackPrompt += stallMessage;
      this.#lastStallAttemptIndex = previousAttempts.length - 1;
    }

    return context;
  }

  getReportSections(result: PluginResult<ClaudeRunnerResult>, _context: PipelineContext): PluginReportSection[] {
    const sections: PluginReportSection[] = [];

    // Add chat conversation section if we have history
    if (this.#conversationHistory.length > 0) {
      sections.push({
        type: 'chat',
        title: 'Claude Conversation',
        messages: [{ role: 'system', content: this.systemPrompt }, ...this.#conversationHistory],
      });
    }

    // Add generated code section for quick reference
    if (result.data?.generatedCode) {
      sections.push({
        type: 'code',
        title: 'Generated C Code',
        language: 'c',
        code: result.data.generatedCode as string,
      });
    }

    return sections;
  }
}
