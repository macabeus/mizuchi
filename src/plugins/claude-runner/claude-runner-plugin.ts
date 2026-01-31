/**
 * Claude Runner Plugin
 *
 * Uses Claude Agent SDK V2 to generate C code from assembly prompts.
 * Maintains session continuity across retry attempts within a pipeline run.
 *
 * Cache uses a conversation tree structure to track multi-turn interactions.
 */
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

import { CCompiler } from '~/shared/c-compiler/c-compiler.js';
import { PipelineConfig } from '~/shared/config';
import { ObjdiffService } from '~/shared/objdiff.js';
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
 * Default system prompt for Claude
 */
const DEFAULT_SYSTEM_PROMPT = `You are an automated decompilation system that converts assembly code into a C code that compiles into identical assembly.

**Operating Context**
- This is a fully automated pipeline with no human review
- Do not request clarifications, confirmations, or permissions
- You can use the read-only tools to inspect the codebase, but you cannot write or modify files directly
- The last C code you provided with be concatenate with the \`{{contextPath}}\` during compilation. No other import statements or includes are supported

**Output Requirements**
- Provide complete, compilable C code in a fenced code block (\`\`\`c)
- The system extracts and compiles only the **last** \`\`\`c block in your response

**Success Criteria**
- The compiled output must produce assembly that matches the target exactly
- Functional equivalence is insufficient; the generated assembly must be identical

**Available Tools**
- \`compile_and_view_assembly\`: Use this tool to test compile your C code and see the resulting assembly BEFORE submitting your final answer. This allows you to iterate and refine your code to match the target assembly more precisely. This code is also concatenated with \`{{contextPath}}\` during compilation

**Workflow**
1. Analyze the provided assembly
2. Read the relevant structure and constants from the context file at \`{{contextPath}}\`
3. Produce equivalent C code
4. Use \`compile_and_view_assembly\` to test your code and see how it compiles
5. Iterate on your code until the assembly looks correct
6. Provide your final C code in a \`\`\`c block
7. The system compiles your code and compares the resulting assembly against the target
8. If mismatches occur, you will receive feedback for iteration`;

/**
 * Configuration schema for ClaudeRunnerPlugin
 */
export const claudeRunnerConfigSchema = z.object({
  projectPath: z.string().optional().describe('Path to the Claude Agent read the project codebase from'),
  timeoutMs: z.number().positive().default(300_000).describe('Timeout in milliseconds for Claude requests'),
  cachePath: z.string().optional().describe('Path to JSON cache file for response caching'),
  model: z.string().optional().describe('Claude model to use'),
  systemPrompt: z.string().optional().describe('System prompt for Claude').default(DEFAULT_SYSTEM_PROMPT),
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
 * Wrap the prompt with instructions to output only code
 */
function wrapPromptWithCodeInstructions(prompt: string): string {
  const suffix = `

# Implementation Process

1. Code Analysis

- Carefully analyze the original assembly function
- Identify function parameters, return values, and local variables
- Map register usage and memory access patterns
- Understand the control flow and logic structure
- Search the codebase to find existing struct, type definitions to reuse, and find patterns

2. C Code Generation

- Output ONLY the C code in a single \`\`\`c code block.

- Write clean, readable C code following these guidelines:

  - Use meaningful variable names
  - Avoid unnecessary goto statements - prefer structured control flow (if/else, loops)
  - Minimize pointer arithmetic where possible
  - Avoid unnecessary type casts
  - Use appropriate data types that match the assembly operations
  - Maintain the code styleguide
  - Before adding a new type definition, search in the codebase if this struct already exists and reuse them whenever possible

- You might need to duplicate a structs if you identify that a struct might be wrong. If that's the case, duplicate it with a new name and modify it as needed.

# Additional Guidelines

- Test after each significant change
- If stuck, try different approaches (different variable types, control structures, etc.)
- When searching in the codebase, ignore the file \`kappa-db.json\``;

  return prompt + suffix;
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
  readonly systemPrompt: string;

  #config: ClaudeRunnerConfig;
  #feedbackPrompt?: string;
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

  // MCP tool dependencies
  #contextPath: string;
  #compilerFlags: string;
  #mcpServer: McpServer;

  constructor(config: ClaudeRunnerConfig, pipelineConfig: PipelineConfig, queryFactory?: QueryFactory) {
    this.systemPrompt = config.systemPrompt.replaceAll('{{contextPath}}', pipelineConfig.contextPath);

    this.#config = config;
    this.#contextPath = pipelineConfig.contextPath;
    this.#compilerFlags = pipelineConfig.compilerFlags;

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

    // Resolve cache path relative to output directory or current directory
    const baseDir = pipelineConfig?.outputDir || process.cwd();
    this.#cachePath = path.resolve(baseDir, config.cachePath || DEFAULT_CACHE_PATH);
  }

  /**
   * Create the MCP server with the compile_and_view_assembly tool
   */
  #createMcpServer(): McpServer {
    const contextPath = this.#contextPath;
    const compilerFlags = this.#compilerFlags;

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
          async (args) => {
            try {
              const compiler = new CCompiler();
              const objdiffService = ObjdiffService.getInstance();

              // Compile the code
              const compileResult = await compiler.compile(args.function_name, args.code, contextPath, compilerFlags);

              if (!compileResult.success) {
                const errorOutput = compileResult.compilationErrors.length
                  ? compileResult.compilationErrors.map((err) => `Line ${err.line}: ${err.message}`).join('\n')
                  : compileResult.errorMessage;

                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Compilation failed:\n\n${errorOutput}`,
                    },
                  ],
                };
              }

              // Parse the object file and extract assembly
              const parsedObject = await objdiffService.parseObjectFile(compileResult.objPath, 'base');
              const diffResult = await objdiffService.runDiff(parsedObject);

              if (!diffResult.left) {
                // Clean up the object file
                await fs.unlink(compileResult.objPath).catch(() => {});
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: 'Failed to parse compiled object file',
                    },
                  ],
                };
              }

              // Check if the symbol exists
              const symbol = diffResult.left.findSymbol(args.function_name, undefined);
              if (!symbol) {
                const availableSymbols = await objdiffService.getSymbolNames(parsedObject);
                // Clean up the object file
                await fs.unlink(compileResult.objPath).catch(() => {});
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Symbol '${args.function_name}' not found in compiled object.\n\nAvailable symbols: ${availableSymbols.join(', ')}\n\nMake sure your function is named exactly '${args.function_name}'.`,
                    },
                  ],
                };
              }

              // Get the assembly
              const assembly = await objdiffService.getAssemblyFromSymbol(diffResult.left, args.function_name);

              // Clean up the object file
              await fs.unlink(compileResult.objPath).catch(() => {});

              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Compilation successful!\n\nAssembly for '${args.function_name}':\n\`\`\`asm\n${assembly}\n\`\`\``,
                  },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                  },
                ],
              };
            }
          },
        ),
      ],
    });
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

    for await (const msg of queryObj) {
      if (msg.type === 'system' && msg.session_id) {
        this.#sessionId = msg.session_id;
      } else if (msg.type === 'assistant' && msg.message?.content) {
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
          throw new Error(`Claude error (${msg.subtype}): ${errors}`);
        }
      }
    }
    return { text: responseText, contentBlocks };
  }

  /**
   * Run a query for initial attempt
   */
  async #runInitialQuery(prompt: string): Promise<{ response: string; fromCache: boolean }> {
    const wrappedPrompt = wrapPromptWithCodeInstructions(prompt);
    this.#initialPromptHash = hashPrompt(wrappedPrompt);

    // Check cache for initial prompt
    const cachedConversation = this.#getCachedConversation(this.#initialPromptHash);
    if (cachedConversation) {
      this.#currentCacheNode = cachedConversation;
      this.#sessionId = cachedConversation.sessionId;
      this.#lastMessageId = cachedConversation.lastMessageId;
      this.#conversationHistory = [
        { role: 'user', content: wrappedPrompt },
        { role: 'assistant', content: cachedConversation.response },
      ];
      return { response: cachedConversation.response, fromCache: true };
    }

    // Create new query with timeout
    const model = this.#config.model || DEFAULT_MODEL;
    this.#currentQuery = this.#queryFactory(wrappedPrompt, { model });

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
        { role: 'user', content: wrappedPrompt },
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
  }

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<ClaudeRunnerResult>;
    context: PipelineContext;
  }> {
    const startTime = Date.now();

    if (!context.promptContent) {
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
      // Load cache on first execution
      await this.#loadCache();

      let response: string;
      let fromCache: boolean;
      let promptUsed: string;

      if (this.#feedbackPrompt) {
        // Retry: continue with follow-up query
        promptUsed = this.#feedbackPrompt;
        const result = await this.#runFollowUpQuery(this.#feedbackPrompt);
        response = result.response;
        fromCache = result.fromCache;
        this.#feedbackPrompt = undefined;
      } else {
        // Initial attempt: run new query
        this.#resetState();
        promptUsed = wrapPromptWithCodeInstructions(context.promptContent);
        const result = await this.#runInitialQuery(context.promptContent);
        response = result.response;
        fromCache = result.fromCache;
      }

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
            data: { rawResponse: response, promptSent: promptUsed, fromCache, generatedCode: '' },
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
            data: { generatedCode: code, rawResponse: response, promptSent: promptUsed, fromCache },
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
          },
        },
        context: { ...context, generatedCode: code },
      };
    } catch (error) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
          data: { fromCache: false, generatedCode: '' },
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

    return context;
  }

  getReportSections(result: PluginResult<ClaudeRunnerResult>, _context: PipelineContext): PluginReportSection[] {
    const sections: PluginReportSection[] = [];

    // Add chat conversation section if we have history
    if (this.#conversationHistory.length > 0) {
      sections.push({
        type: 'chat',
        title: 'Claude Conversation',
        messages: [...this.#conversationHistory],
      });
    }

    // Keep generated code section for quick reference
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
