import { type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it, vi } from 'vitest';

import { ARM_DIFF_SETTINGS, getArmCompilerScript } from '~/shared/c-compiler/__fixtures__/index.js';
import { CCompiler } from '~/shared/c-compiler/c-compiler.js';
import type { CliPrompt } from '~/shared/cli-prompt.js';
import { PipelineAbortError } from '~/shared/errors.js';
import { Objdiff } from '~/shared/objdiff.js';
import { createTestContext, defaultTestPipelineConfig } from '~/shared/test-utils.js';
import type { PipelineContext, PluginReportSection, PluginResult, PluginResultMap } from '~/shared/types.js';

import {
  type ClaudeRunnerConfig,
  ClaudeRunnerPlugin,
  type ClaudeRunnerResult,
  type QueryFactory,
} from './claude-runner-plugin.js';

const TEST_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

interface MockQueryFactoryOptions {
  /** Responses to return in order */
  responses: string[];
  /** If true, return an error result */
  shouldError?: boolean;
  /** Error type to return */
  errorType?: string;
  /**
   * If true, require resume option for follow-up calls.
   * The mock will throw if a follow-up is made without resume.
   */
  requireResumeForFollowUp?: boolean;
  /**
   * If set, emit an assistant message with this error type (e.g., 'rate_limit', 'billing_error')
   * before the error result message. Used to test usage limit detection.
   */
  assistantErrorType?: string;
  /**
   * Number of times to return an error before returning normal responses.
   * Used with assistantErrorType to test retry-after-continue flow.
   * Defaults to Infinity (always error) when shouldError is true.
   */
  errorCount?: number;
}

/**
 * Creates a mock query factory for testing.
 *
 * Key behavior: When `requireResumeForFollowUp` is true (default), the mock
 * will throw an error if a second call is made without the `resume` option.
 * This ensures tests catch bugs where session resumption is not implemented.
 */
function createMockQueryFactory(options: MockQueryFactoryOptions | string[]): QueryFactory {
  // Support simple array form for basic tests
  const opts: MockQueryFactoryOptions = Array.isArray(options)
    ? { responses: options, requireResumeForFollowUp: true }
    : { requireResumeForFollowUp: true, ...options };

  let responseIndex = 0;
  let sessionStarted = false;
  let errorCallCount = 0;

  const factory = vi.fn((_prompt: string, _options: { model?: string; resume?: string }) => {
    const isResume = _options?.resume !== undefined;

    // Enforce resume requirement: if session already started and no resume provided, fail
    if (opts.requireResumeForFollowUp && sessionStarted && !isResume) {
      throw new Error(
        'Mock: Expected resume option for follow-up query. ' +
          'The session was already started but no resume session ID was provided.',
      );
    }

    // Mark session as started for new (non-resume) queries
    if (!isResume) {
      sessionStarted = true;
    }

    async function* generateMessages(): AsyncGenerator<SDKMessage> {
      // Emit system message only for new sessions (not resumes)
      if (!isResume) {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: TEST_SESSION_ID,
        } as SDKMessage;
      }

      // Check if we should return an error (with optional finite error count)
      const shouldReturnError = opts.shouldError && errorCallCount < (opts.errorCount ?? Infinity);

      if (shouldReturnError) {
        errorCallCount++;

        // Emit assistant message with error type if specified (e.g., 'rate_limit', 'billing_error')
        if (opts.assistantErrorType) {
          yield {
            type: 'assistant',
            session_id: TEST_SESSION_ID,
            error: opts.assistantErrorType,
            message: {
              id: `msg-error-${errorCallCount}`,
              content: [{ type: 'text', text: 'Rate limit exceeded' }],
            },
          } as SDKMessage;
        }

        yield {
          type: 'result',
          subtype: opts.errorType || 'error_during_execution',
          session_id: TEST_SESSION_ID,
          is_error: true,
          errors: ['Mock error'],
        } as SDKMessage;
        return;
      }

      const response = opts.responses[responseIndex++] || '';
      yield {
        type: 'assistant',
        session_id: TEST_SESSION_ID,
        message: {
          id: `msg-${responseIndex}`,
          content: [{ type: 'text', text: response }],
        },
      } as SDKMessage;

      yield {
        type: 'result',
        subtype: 'success',
        session_id: TEST_SESSION_ID,
        is_error: false,
      } as SDKMessage;
    }

    return {
      [Symbol.asyncIterator]: () => generateMessages(),
      close: vi.fn(),
    } as any;
  });

  return factory;
}

const defaultPluginConfig: ClaudeRunnerConfig = {
  timeoutMs: 300000,
  systemPrompt: '{{promptContent}}',
  kickoffMessage: 'Decompile the function.',
  stallThreshold: 3,
  toolCallLimit: 7,
};

const testCCompiler = new CCompiler(getArmCompilerScript());
const testObjdiff = new Objdiff(ARM_DIFF_SETTINGS);

describe('ClaudeRunnerPlugin', () => {
  describe('constructor', () => {
    it('creates plugin with default options', () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      expect(plugin.id).toBe('claude-runner');
      expect(plugin.name).toBe('Claude Runner');
      expect(plugin.description).toContain('Claude Agent SDK');
    });

    it('creates plugin with custom timeout', () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: { ...defaultPluginConfig, timeoutMs: 60000 },
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      expect(plugin.id).toBe('claude-runner');
    });
  });

  describe('.execute', () => {
    it('includes the m2c context in the prompt when available', async () => {
      const cCode = 'int testFunc(void) {\n  return 42;\n}';
      const response = `Here is the code:\n\n\`\`\`c\n${cCode}\n\`\`\``;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const m2cGeneratedCode = 'int testFunc(void) {\n  return 42;\n';
      const m2cCompilationError = "error: expected '}' at end of input";
      const context: PipelineContext = {
        ...createTestContext(),
        m2cContext: {
          generatedCode: m2cGeneratedCode,
          compilationError: m2cCompilationError,
        },
      };

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('success');

      const sections = plugin.getReportSections!(result, context);
      const chatSection = sections.find((s) => s.type === 'chat') as PluginReportSection & { type: 'chat' };
      expect(chatSection).toBeDefined();

      // First message is system prompt (which includes the task + m2c context)
      const systemMessage = chatSection.messages[0];
      expect(systemMessage.role).toBe('system');
      expect(typeof systemMessage.content).toBe('string');

      // Verify the m2c context section is included in the system prompt
      expect(systemMessage.content).toContain('Initial Decompilation');
      expect(systemMessage.content).toContain(m2cGeneratedCode);
      expect(systemMessage.content).toContain('Matching Result');
      expect(systemMessage.content).toContain(m2cCompilationError);
    });

    it('extracts C code from response with code block', async () => {
      const cCode = 'int testFunc(void) {\n  return 42;\n}';
      const response = `Here is the code:\n\n\`\`\`c\n${cCode}\n\`\`\``;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(newContext.generatedCode).toBe(cCode);
      expect(result.data?.generatedCode).toBe(cCode);
    });

    it('extracts C code from response with C language marker', async () => {
      const cCode = 'void foo(void) {\n  int x = 1;\n}';
      const response = `\`\`\`C\n${cCode}\n\`\`\``;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(newContext.generatedCode).toBe(cCode);
    });

    it('fails when no prompt content is provided', async () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext({ promptContent: undefined });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('No prompt content');
    });

    it('fails when no C code can be extracted', async () => {
      const response = 'I cannot help with that request.';

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('Could not extract C code');
    });

    it('fails when code has unbalanced braces', async () => {
      const response = '```c\nint foo(void) {\n  return 1;\n```';

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('Missing braces');
    });

    it('fails when code has no function definition', async () => {
      const response = '```c\ntypedef struct { int x; } Foo;\n```';

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('No function definition');
    });

    it('handles SDK errors gracefully', async () => {
      const mockFactory = createMockQueryFactory({
        responses: [],
        shouldError: true,
        errorType: 'error_during_execution',
      });
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('Claude error');
    });

    it('handles max turns error', async () => {
      const mockFactory = createMockQueryFactory({
        responses: [],
        shouldError: true,
        errorType: 'error_max_turns',
      });
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('error_max_turns');
    });

    it('returns only the last code block', async () => {
      const response = `
Since we have this struct:
\`\`\`c
typedef struct {
  int x;
  int y;
} Point;
\`\`\`

I think the solution is:
\`\`\`c
void movePoint(Point* p) {
  p->x += 1;
  p->y += 1;
}
\`\`\`
`;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(newContext.generatedCode).not.toContain('typedef struct');
      expect(newContext.generatedCode).toContain('void movePoint');
    });

    it('reports duration in result', async () => {
      const response = '```c\nint foo(void) { return 1; }\n```';

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('.prepareRetry', () => {
    it('builds feedback prompt with compilation error', async () => {
      const cCode = 'int foo(void) { return 1; }';
      const response = `\`\`\`c\n${cCode}\n\`\`\``;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext({ attemptNumber: 2 });

      const previousAttempts = [
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 2;', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'failure' as const,
            durationMs: 50,
            error: "error: expected '}' at end of input",
          },
        },
      ];

      const newContext = plugin.prepareRetry!(context, previousAttempts);

      // The feedback prompt is stored internally, verify by executing
      expect(newContext).toBeDefined();
    });

    it('builds feedback prompt with assembly mismatch', async () => {
      const cCode = 'int foo(void) { return 1; }';
      const response = `\`\`\`c\n${cCode}\n\`\`\``;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext({ attemptNumber: 2 });

      const previousAttempts = [
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 2; }', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'success' as const,
            durationMs: 50,
          },
          objdiff: {
            pluginId: 'objdiff',
            pluginName: 'ObjDiff',
            status: 'failure' as const,
            durationMs: 30,
            output: '- mov eax, 1\n+ mov eax, 2',
          },
        },
      ];

      const newContext = plugin.prepareRetry!(context, previousAttempts);

      expect(newContext).toBeDefined();
    });

    it('returns context unchanged when no previous attempts', () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const newContext = plugin.prepareRetry!(context, []);

      expect(newContext).toEqual(context);
    });

    it('returns context unchanged when no claude result in previous attempt', () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      // No 'claude-runner' key in the attempt object
      const previousAttempts = [{}];

      const newContext = plugin.prepareRetry!(context, previousAttempts);

      expect(newContext).toEqual(context);
    });

    it('identifies when last attempt is worse than previous best attempt', async () => {
      const response1 = '```c\nint foo(void) { return 1; }\n```';
      const response2 = '```c\nint foo(void) { return 3; }\n```';
      const mockFactory = createMockQueryFactory([response1, response2]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      // First execution to establish the session
      const result1 = await plugin.execute(context);
      expect(result1.result.status).toBe('success');

      const previousAttempts = [
        // Attempt 1: compiled successfully with 5 mismatches (BEST)
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 1; }', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'success' as const,
            durationMs: 50,
          },
          objdiff: {
            pluginId: 'objdiff',
            pluginName: 'ObjDiff',
            status: 'failure' as const,
            durationMs: 30,
            output: 'diff output',
            data: { differenceCount: 5 },
          },
        },
        // Attempt 2: compiled successfully but with 10 mismatches (WORSE)
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 2; }', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'success' as const,
            durationMs: 50,
          },
          objdiff: {
            pluginId: 'objdiff',
            pluginName: 'ObjDiff',
            status: 'failure' as const,
            durationMs: 30,
            output: 'diff output from attempt 2',
            data: { differenceCount: 10 },
          },
        },
      ];

      // Prepare retry - should identify attempt 1 as better and set up reminder
      // @ts-expect-error - test data has partial ObjdiffResult (only differenceCount)
      const resultContext = plugin.prepareRetry!(context, previousAttempts);
      expect(resultContext).toEqual(context);

      // Second execution - should use the follow-up with reminder
      const { result } = await plugin.execute(context);

      expect(result.status).toBe('success');

      // Verify the factory was called twice (initial + resume)
      expect((mockFactory as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);

      // Check the conversation history via report sections
      const sections = plugin.getReportSections!(result, context);
      const chatSection = sections.find((s) => s.type === 'chat') as PluginReportSection & { type: 'chat' };
      expect(chatSection).toBeDefined();

      // Should have 5 messages: system, initial user, initial assistant, follow-up user, follow-up assistant
      expect(chatSection.messages.length).toBe(5);

      // The fourth message should be the follow-up user message with reminder
      const followUpMessage = chatSection.messages[3];
      expect(followUpMessage.role).toBe('user');
      expect(typeof followUpMessage.content).toBe('string');

      // Verify the reminder is included in the follow-up
      expect(followUpMessage.content).toContain('Reminder');
      expect(followUpMessage.content).toContain('int foo(void) { return 1; }');
      expect(followUpMessage.content).toContain('5 mismatches');
    });

    it('does not trigger reminder logic when last attempt is better', () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const previousAttempts = [
        // Attempt 1: compiled successfully with 10 mismatches
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 1; }', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'success' as const,
            durationMs: 50,
          },
          objdiff: {
            pluginId: 'objdiff',
            pluginName: 'ObjDiff',
            status: 'failure' as const,
            durationMs: 30,
            output: 'diff output',
            data: { differenceCount: 10 },
          },
        },
        // Attempt 2: compiled successfully with 5 mismatches (BETTER)
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 2; }', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'success' as const,
            durationMs: 50,
          },
          objdiff: {
            pluginId: 'objdiff',
            pluginName: 'ObjDiff',
            status: 'failure' as const,
            durationMs: 30,
            output: 'diff output',
            data: { differenceCount: 5 },
          },
        },
      ];

      // Prepare retry - should NOT trigger reminder since last attempt (5) is better than previous (10)
      // This tests that the comparison logic correctly identifies when NOT to show a reminder
      // @ts-expect-error - test data has partial ObjdiffResult (only differenceCount)
      const newContext = plugin.prepareRetry!(context, previousAttempts);

      // Should return context successfully
      expect(newContext).toBeDefined();
    });

    it('shows reminder with previous code when it had compilation error', async () => {
      const response1 = '```c\nint foo(void) { return 1; }\n```';
      const response2 = '```c\nint foo(void) { return 42; }\n```';
      const mockFactory = createMockQueryFactory([response1, response2]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      // First execution to establish the session
      const result1 = await plugin.execute(context);
      expect(result1.result.status).toBe('success');

      const previousAttempts = [
        // Only one attempt: compilation error (missing closing brace and semicolon)
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 99', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'failure' as const,
            durationMs: 50,
            error: "error: expected '}' at end of input",
            output: "error: expected '}' at end of input",
          },
        },
      ];

      // Prepare retry - should build feedback with compilation error
      const resultContext = plugin.prepareRetry!(context, previousAttempts);
      expect(resultContext).toEqual(context);

      // Second execution - should use the follow-up with the error
      const { result } = await plugin.execute(context);

      expect(result.status).toBe('success');

      // Verify the factory was called twice (initial + resume)
      expect((mockFactory as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);

      // Check the conversation history via report sections
      const sections = plugin.getReportSections!(result, context);
      const chatSection = sections.find((s) => s.type === 'chat') as PluginReportSection & { type: 'chat' };
      expect(chatSection).toBeDefined();

      // Should have 5 messages: system, initial user, initial assistant, follow-up user, follow-up assistant
      expect(chatSection.messages.length).toBe(5);

      // The fourth message should be the follow-up user message with compilation error
      const followUpMessage = chatSection.messages[3];
      expect(followUpMessage.role).toBe('user');
      expect(typeof followUpMessage.content).toBe('string');

      // Verify the compilation error is mentioned
      expect(followUpMessage.content).toContain("expected '}'");
      expect(followUpMessage.content).toContain('failed to compile');
    });

    it('asks for C code when previous response had no code', async () => {
      const response1 = '```c\nint foo(void) { return 1; }\n```';
      const response2 = '```c\nint foo(void) { return 42; }\n```';
      const mockFactory = createMockQueryFactory([response1, response2]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      // First execution to establish the session
      const result1 = await plugin.execute(context);
      expect(result1.result.status).toBe('success');

      const previousAttempts = [
        // Only one attempt: Claude didn't provide C code
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'failure' as const,
            durationMs: 100,
            error: 'Could not extract C code from response',
            data: { generatedCode: undefined, fromCache: false, stallDetected: false },
          },
        },
      ];

      // Prepare retry - should build feedback asking for C code
      // @ts-expect-error - test data has generatedCode: undefined
      const resultContext = plugin.prepareRetry!(context, previousAttempts);
      expect(resultContext).toEqual(context);

      // Second execution - should use the follow-up asking for code
      const { result } = await plugin.execute(context);

      expect(result.status).toBe('success');

      // Verify the factory was called twice (initial + resume)
      expect((mockFactory as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);

      // Check the conversation history via report sections
      const sections = plugin.getReportSections!(result, context);
      const chatSection = sections.find((s) => s.type === 'chat') as PluginReportSection & { type: 'chat' };
      expect(chatSection).toBeDefined();

      // Should have 5 messages: system, initial user, initial assistant, follow-up user, follow-up assistant
      expect(chatSection.messages.length).toBe(5);

      // The fourth message should be the follow-up user message asking for C code
      const followUpMessage = chatSection.messages[3];
      expect(followUpMessage.role).toBe('user');
      expect(typeof followUpMessage.content).toBe('string');

      // Verify it asks for C code
      expect(followUpMessage.content).toContain('Please provide only the C code');
    });

    describe('stall detection', () => {
      function createAttemptWithDiffCount(differenceCount: number): Partial<PluginResultMap> {
        return {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 1; }', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'success' as const,
            durationMs: 50,
          },
          objdiff: {
            pluginId: 'objdiff',
            pluginName: 'ObjDiff',
            status: 'failure' as const,
            durationMs: 30,
            output: 'Assembly mismatch: diff output',
            data: { differenceCount },
          },
        } as Partial<PluginResultMap>;
      }

      function createAttemptWithCompilationError(): Partial<PluginResultMap> {
        return {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'failure' as const,
            durationMs: 50,
            error: "error: expected '}' at end of input",
            output: "error: expected '}' at end of input",
          },
        };
      }

      function getFollowUpContent(
        plugin: ClaudeRunnerPlugin,
        result: PluginResult<ClaudeRunnerResult>,
        context: PipelineContext,
      ): string {
        const sections = plugin.getReportSections!(result, context);
        const chatSection = sections.find((s) => s.type === 'chat') as PluginReportSection & { type: 'chat' };
        expect(chatSection).toBeDefined();

        const messages = chatSection.messages;
        // messages[0] = system, messages[1] = user kickoff, messages[2] = assistant, messages[3] = follow-up user
        const followUpMessage = messages[3];
        expect(followUpMessage.role).toBe('user');
        expect(typeof followUpMessage.content).toBe('string');

        return followUpMessage.content as string;
      }

      it('appends stall recovery message when no improvement for stallThreshold attempts', async () => {
        const response1 = '```c\nint foo(void) { return 1; }\n```';
        const response2 = '```c\nint foo(void) { return 42; }\n```';
        const mockFactory = createMockQueryFactory([response1, response2]);
        const plugin = new ClaudeRunnerPlugin({
          config: { ...defaultPluginConfig, stallThreshold: 3 },
          pipelineConfig: defaultTestPipelineConfig,
          cCompiler: testCCompiler,
          objdiff: testObjdiff,
          queryFactory: mockFactory,
        });
        const context = createTestContext();

        await plugin.execute(context);

        const previousAttempts = [
          createAttemptWithDiffCount(10),
          createAttemptWithDiffCount(10),
          createAttemptWithDiffCount(10),
        ];

        plugin.prepareRetry!(context, previousAttempts);
        const { result } = await plugin.execute(context);

        const content = getFollowUpContent(plugin, result, context);
        expect(content).toContain('stuck in a loop');
        expect(content).toContain('fundamentally different strategy');
      });

      it('appends stall recovery message when differenceCount increases over window', async () => {
        const response1 = '```c\nint foo(void) { return 1; }\n```';
        const response2 = '```c\nint foo(void) { return 42; }\n```';
        const mockFactory = createMockQueryFactory([response1, response2]);
        const plugin = new ClaudeRunnerPlugin({
          config: { ...defaultPluginConfig, stallThreshold: 3 },
          pipelineConfig: defaultTestPipelineConfig,
          cCompiler: testCCompiler,
          objdiff: testObjdiff,
          queryFactory: mockFactory,
        });
        const context = createTestContext();

        await plugin.execute(context);

        // differenceCount: 5 → 8 → 10, newest (10) >= oldest (5) = stalled
        const previousAttempts = [
          createAttemptWithDiffCount(5),
          createAttemptWithDiffCount(8),
          createAttemptWithDiffCount(10),
        ];

        plugin.prepareRetry!(context, previousAttempts);
        const { result } = await plugin.execute(context);

        const content = getFollowUpContent(plugin, result, context);
        expect(content).toContain('stuck in a loop');
      });

      it('does not append stall message when differenceCount improves within window', async () => {
        const response1 = '```c\nint foo(void) { return 1; }\n```';
        const response2 = '```c\nint foo(void) { return 42; }\n```';
        const mockFactory = createMockQueryFactory([response1, response2]);
        const plugin = new ClaudeRunnerPlugin({
          config: { ...defaultPluginConfig, stallThreshold: 3 },
          pipelineConfig: defaultTestPipelineConfig,
          cCompiler: testCCompiler,
          objdiff: testObjdiff,
          queryFactory: mockFactory,
        });
        const context = createTestContext();

        await plugin.execute(context);

        // differenceCount: 10 → 8 → 5, newest (5) < oldest (10) = improving
        const previousAttempts = [
          createAttemptWithDiffCount(10),
          createAttemptWithDiffCount(8),
          createAttemptWithDiffCount(5),
        ];

        plugin.prepareRetry!(context, previousAttempts);
        const { result } = await plugin.execute(context);

        const content = getFollowUpContent(plugin, result, context);
        expect(content).not.toContain('stuck in a loop');
      });

      it('skips compilation failures when computing stall window', async () => {
        const response1 = '```c\nint foo(void) { return 1; }\n```';
        const response2 = '```c\nint foo(void) { return 42; }\n```';
        const mockFactory = createMockQueryFactory([response1, response2]);
        const plugin = new ClaudeRunnerPlugin({
          config: { ...defaultPluginConfig, stallThreshold: 3 },
          pipelineConfig: defaultTestPipelineConfig,
          cCompiler: testCCompiler,
          objdiff: testObjdiff,
          queryFactory: mockFactory,
        });
        const context = createTestContext();

        await plugin.execute(context);

        // Only 2 measured attempts (compilation error skipped), threshold=3 → no stall
        const previousAttempts = [
          createAttemptWithDiffCount(10),
          createAttemptWithCompilationError(),
          createAttemptWithDiffCount(10),
        ];

        plugin.prepareRetry!(context, previousAttempts);
        const { result } = await plugin.execute(context);

        const content = getFollowUpContent(plugin, result, context);
        expect(content).not.toContain('stuck in a loop');
      });

      it('does not trigger stall detection with fewer attempts than threshold', async () => {
        const response1 = '```c\nint foo(void) { return 1; }\n```';
        const response2 = '```c\nint foo(void) { return 42; }\n```';
        const mockFactory = createMockQueryFactory([response1, response2]);
        const plugin = new ClaudeRunnerPlugin({
          config: { ...defaultPluginConfig, stallThreshold: 3 },
          pipelineConfig: defaultTestPipelineConfig,
          cCompiler: testCCompiler,
          objdiff: testObjdiff,
          queryFactory: mockFactory,
        });
        const context = createTestContext();

        await plugin.execute(context);

        // Only 2 attempts, threshold=3 → no stall
        const previousAttempts = [createAttemptWithDiffCount(10), createAttemptWithDiffCount(10)];

        plugin.prepareRetry!(context, previousAttempts);
        const { result } = await plugin.execute(context);

        const content = getFollowUpContent(plugin, result, context);
        expect(content).not.toContain('stuck in a loop');
      });

      it('uses custom stallThreshold from config', async () => {
        const response1 = '```c\nint foo(void) { return 1; }\n```';
        const response2 = '```c\nint foo(void) { return 42; }\n```';
        const mockFactory = createMockQueryFactory([response1, response2]);
        const plugin = new ClaudeRunnerPlugin({
          config: { ...defaultPluginConfig, stallThreshold: 2 },
          pipelineConfig: defaultTestPipelineConfig,
          cCompiler: testCCompiler,
          objdiff: testObjdiff,
          queryFactory: mockFactory,
        });
        const context = createTestContext();

        await plugin.execute(context);

        // stallThreshold=2, 2 stalled attempts → triggers
        const previousAttempts = [createAttemptWithDiffCount(10), createAttemptWithDiffCount(10)];

        plugin.prepareRetry!(context, previousAttempts);
        const { result } = await plugin.execute(context);

        const content = getFollowUpContent(plugin, result, context);
        expect(content).toContain('Your last 2 attempts');
        expect(content).toContain('stuck in a loop');
      });

      it('does not trigger stall when improvement occurs within window', async () => {
        const response1 = '```c\nint foo(void) { return 1; }\n```';
        const response2 = '```c\nint foo(void) { return 42; }\n```';
        const mockFactory = createMockQueryFactory([response1, response2]);
        const plugin = new ClaudeRunnerPlugin({
          config: { ...defaultPluginConfig, stallThreshold: 3 },
          pipelineConfig: defaultTestPipelineConfig,
          cCompiler: testCCompiler,
          objdiff: testObjdiff,
          queryFactory: mockFactory,
        });
        const context = createTestContext();

        await plugin.execute(context);

        // Window is last 3 measured: [5, 4, 3], newest (3) < oldest (5) → not stalled
        const previousAttempts = [
          createAttemptWithDiffCount(10),
          createAttemptWithDiffCount(10),
          createAttemptWithDiffCount(5),
          createAttemptWithDiffCount(4),
          createAttemptWithDiffCount(3),
        ];

        plugin.prepareRetry!(context, previousAttempts);
        const { result } = await plugin.execute(context);

        const content = getFollowUpContent(plugin, result, context);
        expect(content).not.toContain('stuck in a loop');
      });

      it('does not repeat stall message on the attempt immediately after a stall', async () => {
        const responses = [
          '```c\nint foo(void) { return 1; }\n```',
          '```c\nint foo(void) { return 2; }\n```',
          '```c\nint foo(void) { return 3; }\n```',
        ];
        const mockFactory = createMockQueryFactory(responses);
        const plugin = new ClaudeRunnerPlugin({
          config: { ...defaultPluginConfig, stallThreshold: 3 },
          pipelineConfig: defaultTestPipelineConfig,
          cCompiler: testCCompiler,
          objdiff: testObjdiff,
          queryFactory: mockFactory,
        });
        const context = createTestContext();

        await plugin.execute(context);

        // First 3 attempts stall: 10, 10, 10
        const previousAttempts = [
          createAttemptWithDiffCount(10),
          createAttemptWithDiffCount(10),
          createAttemptWithDiffCount(10),
        ];

        plugin.prepareRetry!(context, previousAttempts);
        const { result: result1 } = await plugin.execute(context);
        const content1 = getFollowUpContent(plugin, result1, context);
        expect(content1).toContain('stuck in a loop');

        // 4th attempt also stalls at 10, but should NOT repeat the stall message
        // since only 1 new attempt has been added since the last stall
        previousAttempts.push(createAttemptWithDiffCount(10));
        plugin.prepareRetry!(context, previousAttempts);
        const { result: result2 } = await plugin.execute(context);

        expect(result2.data!.stallDetected).toBe(false);
      });
    });
  });

  describe('session continuity', () => {
    it('creates new session for initial attempt', async () => {
      const response = '```c\nint foo(void) { return 1; }\n```';
      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      await plugin.execute(context);

      expect(mockFactory).toHaveBeenCalledTimes(1);
    });

    it('reuses session for retry attempts', async () => {
      const response1 = '```c\nint foo(void) { return 1; }\n```';
      const response2 = '```c\nint foo(void) { return 2; }\n```';
      const mockFactory = createMockQueryFactory([response1, response2]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      // Initial attempt
      await plugin.execute(context);

      // Prepare retry
      const previousAttempts = [
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 1; }', fromCache: false, stallDetected: false },
          },
          compiler: {
            pluginId: 'compiler',
            pluginName: 'Compiler',
            status: 'failure' as const,
            durationMs: 50,
            error: 'Some error',
          },
        },
      ];
      plugin.prepareRetry!(context, previousAttempts);

      // Retry attempt - should reuse session by resuming
      // The mock will throw if resume is not passed, causing failure
      const { result } = await plugin.execute(context);

      // Verify the retry succeeded (mock didn't throw)
      expect(result.status).toBe('success');
      expect(mockFactory).toHaveBeenCalledTimes(2);
    });

    it('creates new session for new pipeline run', async () => {
      const response1 = '```c\nint foo(void) { return 1; }\n```';
      const response2 = '```c\nint bar(void) { return 2; }\n```';
      // Disable resume requirement - this test intentionally creates separate sessions
      const mockFactory = createMockQueryFactory({
        responses: [response1, response2],
        requireResumeForFollowUp: false,
      });
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      // First pipeline run
      const context1 = createTestContext({ functionName: 'foo' });
      await plugin.execute(context1);

      // Second pipeline run (different function - simulates new pipeline)
      const context2 = createTestContext({ functionName: 'bar', promptContent: 'Different prompt' });
      await plugin.execute(context2);

      // Should create 2 sessions (one per pipeline run)
      expect(mockFactory).toHaveBeenCalledTimes(2);
    });
  });

  describe('code extraction', () => {
    it('extracts C code from a simple response', async () => {
      const response = '```c\nvoid func(void) { u32 x = 0; }\n```';

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(newContext.generatedCode).toBe('void func(void) { u32 x = 0; }');
    });

    it('deduplicates function definitions in multiple blocks', async () => {
      const response = `Given I tried this code:

\`\`\`c
int foo(void) { return 1; }
\`\`\`

Let me fix using this:

\`\`\`c
int foo(void) { return 2; }
\`\`\`
`;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(newContext.generatedCode).toBe('int foo(void) { return 2; }');
    });

    it('handles two consecutive C blocks', async () => {
      const response = `
\`\`\`c
struct Task {
  int id;
};
\`\`\`

\`\`\`c
void processTask(struct Task* t) {
  t->id = 0;
}
\`\`\`
`;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(newContext.generatedCode).toBe(`void processTask(struct Task* t) {
  t->id = 0;
}`);
    });

    it('handles when finishing with non C block', async () => {
      const response = `Let's try this:
\`\`\`c
void processTask(struct Task* t) {
  t->id = 0;
}
\`\`\`

Since we have this assembly line:

\`\`\`asm
mov eax, 0
\`\`\`
`;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(newContext.generatedCode).toBe(`void processTask(struct Task* t) {
  t->id = 0;
}`);
    });
  });

  describe('plugin properties', () => {
    it('has static pluginId and configSchema', () => {
      expect(ClaudeRunnerPlugin.pluginId).toBe('claude-runner');
      expect(ClaudeRunnerPlugin.configSchema).toBeDefined();
    });
  });

  describe('.getReportSections', () => {
    it('returns chat section with conversation history', async () => {
      const response = '```c\nint foo(void) { return 1; }\n```';
      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);
      const sections = plugin.getReportSections!(result, context);

      // Should have chat section
      const chatSection = sections.find((s) => s.type === 'chat') as PluginReportSection & { type: 'chat' };
      expect(chatSection).toBeDefined();
      expect(chatSection.messages.length).toBeGreaterThan(0);
      expect(chatSection.messages[0].role).toBe('system');
      expect(chatSection.messages[1].role).toBe('user');
      expect(chatSection.messages[2].role).toBe('assistant');

      // Should also have code section
      const codeSection = sections.find((s) => s.type === 'code');
      expect(codeSection).toBeDefined();
    });
  });

  describe('compile_and_view_assembly tool', () => {
    const validCode = 'int testFunc(void) { return 42; }';
    const toolArgs = { code: validCode, function_name: 'testFunc' };

    it('compiles valid C code and returns assembly with countdown', async () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      const result = await plugin.handleCompileAndViewAssembly(toolArgs);

      const text = result.content[0].text;
      expect(text).toContain('Compilation successful!');
      expect(text).toContain("Assembly for 'testFunc'");
      expect(text).toContain('```asm');
      expect(text).toContain('⚠ Tool calls remaining: 6/7');
    });

    it('returns compilation error with countdown for invalid code', async () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      const result = await plugin.handleCompileAndViewAssembly({
        code: 'int testFunc(void) { return }',
        function_name: 'testFunc',
      });

      const text = result.content[0].text;
      expect(text).toContain('Compilation failed');
      expect(text).toContain('⚠ Tool calls remaining: 6/7');
    });

    it('returns symbol not found when function name does not match', async () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      const result = await plugin.handleCompileAndViewAssembly({
        code: validCode,
        function_name: 'wrongFunc',
      });

      const text = result.content[0].text;
      expect(text).toContain("Symbol 'wrongFunc' not found");
      expect(text).toContain('testFunc');
      expect(text).toContain('⚠ Tool calls remaining: 6/7');
    });

    it('decrements countdown on each successive call', async () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: { ...defaultPluginConfig, toolCallLimit: 3 },
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      const result1 = await plugin.handleCompileAndViewAssembly(toolArgs);
      expect(result1.content[0].text).toContain('Tool calls remaining: 2/3');

      const result2 = await plugin.handleCompileAndViewAssembly(toolArgs);
      expect(result2.content[0].text).toContain('Tool calls remaining: 1/3');

      const result3 = await plugin.handleCompileAndViewAssembly(toolArgs);
      expect(result3.content[0].text).toContain('Tool calls remaining: 0/3');
    });

    it('refuses execution after reaching the tool call limit', async () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: { ...defaultPluginConfig, toolCallLimit: 2 },
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      // Use up the limit
      await plugin.handleCompileAndViewAssembly(toolArgs);
      await plugin.handleCompileAndViewAssembly(toolArgs);

      // Third call should be refused
      const result = await plugin.handleCompileAndViewAssembly(toolArgs);
      const text = result.content[0].text;
      expect(text).toContain('❌ Tool call limit reached (2/2)');
      expect(text).toContain('submit your final answer');
      expect(text).not.toContain('Compilation successful');
    });

    it('keeps refusing after limit is reached', async () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin({
        config: { ...defaultPluginConfig, toolCallLimit: 1 },
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      await plugin.handleCompileAndViewAssembly(toolArgs);

      // Both subsequent calls should be refused
      const result2 = await plugin.handleCompileAndViewAssembly(toolArgs);
      expect(result2.content[0].text).toContain('❌ Tool call limit reached');

      const result3 = await plugin.handleCompileAndViewAssembly(toolArgs);
      expect(result3.content[0].text).toContain('❌ Tool call limit reached');
    });

    it('resets counter between execute() calls', async () => {
      const cCode = 'int testFunc(void) { return 42; }';
      const response = `\`\`\`c\n${cCode}\n\`\`\``;
      const mockFactory = createMockQueryFactory({
        responses: [response, response],
        requireResumeForFollowUp: false,
      });
      const plugin = new ClaudeRunnerPlugin({
        config: { ...defaultPluginConfig, toolCallLimit: 2 },
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      // Use up the limit
      await plugin.handleCompileAndViewAssembly(toolArgs);
      await plugin.handleCompileAndViewAssembly(toolArgs);

      // Verify limit is reached
      const blockedResult = await plugin.handleCompileAndViewAssembly(toolArgs);
      expect(blockedResult.content[0].text).toContain('❌ Tool call limit reached');

      // execute() resets the counter
      await plugin.execute(context);

      // Should work again
      const result = await plugin.handleCompileAndViewAssembly(toolArgs);
      expect(result.content[0].text).toContain('Compilation successful');
      expect(result.content[0].text).toContain('Tool calls remaining: 1/2');
    });
  });

  describe('usage limit handling', () => {
    function createMockCliPrompt(choice: string): CliPrompt {
      return {
        askChoice: vi.fn().mockResolvedValue(choice),
      };
    }

    it('detects rate_limit error and prompts user when cliPrompt is provided', async () => {
      const cCode = 'int foo(void) { return 1; }';
      const response = `\`\`\`c\n${cCode}\n\`\`\``;
      const mockFactory = createMockQueryFactory({
        responses: [response],
        shouldError: true,
        errorCount: 1, // Error once, then succeed
        assistantErrorType: 'rate_limit',
        requireResumeForFollowUp: false,
      });
      const mockCliPrompt = createMockCliPrompt('continue');
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
        cliPrompt: mockCliPrompt,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      // Should succeed after user chose "continue"
      expect(result.status).toBe('success');
      expect(result.data?.generatedCode).toBe(cCode);

      // Verify the prompt was shown
      expect(mockCliPrompt.askChoice).toHaveBeenCalledTimes(1);
      expect(mockCliPrompt.askChoice).toHaveBeenCalledWith(
        expect.stringContaining('API plan usage limit reached'),
        expect.arrayContaining([
          expect.objectContaining({ value: 'continue' }),
          expect.objectContaining({ value: 'abort' }),
        ]),
      );

      // Verify the factory was called twice (first errored, second succeeded)
      expect(mockFactory).toHaveBeenCalledTimes(2);
    });

    it('detects billing_error and prompts user', async () => {
      const cCode = 'int foo(void) { return 1; }';
      const response = `\`\`\`c\n${cCode}\n\`\`\``;
      const mockFactory = createMockQueryFactory({
        responses: [response],
        shouldError: true,
        errorCount: 1,
        assistantErrorType: 'billing_error',
        requireResumeForFollowUp: false,
      });
      const mockCliPrompt = createMockCliPrompt('continue');
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
        cliPrompt: mockCliPrompt,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(mockCliPrompt.askChoice).toHaveBeenCalledTimes(1);
    });

    it('throws PipelineAbortError when user chooses abort', async () => {
      const mockFactory = createMockQueryFactory({
        responses: [],
        shouldError: true,
        assistantErrorType: 'rate_limit',
        requireResumeForFollowUp: false,
      });
      const mockCliPrompt = createMockCliPrompt('abort');
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
        cliPrompt: mockCliPrompt,
      });
      const context = createTestContext();

      await expect(plugin.execute(context)).rejects.toThrow(PipelineAbortError);
      expect(mockCliPrompt.askChoice).toHaveBeenCalledTimes(1);
    });

    it('treats usage limit error as regular error when no cliPrompt is provided', async () => {
      const mockFactory = createMockQueryFactory({
        responses: [],
        shouldError: true,
        assistantErrorType: 'rate_limit',
        requireResumeForFollowUp: false,
      });
      // No cliPrompt - should fall through to regular error handling
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      // Should fail without prompting (no cliPrompt to prompt with)
      expect(result.status).toBe('failure');
      expect(result.error).toContain('Mock error');
    });

    it('includes function name and attempt info in prompt message', async () => {
      const cCode = 'int myFunc(void) { return 1; }';
      const response = `\`\`\`c\n${cCode}\n\`\`\``;
      const mockFactory = createMockQueryFactory({
        responses: [response],
        shouldError: true,
        errorCount: 1,
        assistantErrorType: 'rate_limit',
        requireResumeForFollowUp: false,
      });
      const mockCliPrompt = createMockCliPrompt('continue');
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
        cliPrompt: mockCliPrompt,
      });
      const context = createTestContext({
        functionName: 'myFunc',
        attemptNumber: 3,
        maxRetries: 10,
      });

      await plugin.execute(context);

      expect(mockCliPrompt.askChoice).toHaveBeenCalledWith(expect.stringContaining('"myFunc"'), expect.anything());
      expect(mockCliPrompt.askChoice).toHaveBeenCalledWith(expect.stringContaining('attempt 3/10'), expect.anything());
    });

    it('does not treat non-usage-limit errors as pausable', async () => {
      // Error with no assistantErrorType (e.g., server_error) should not trigger prompt
      const mockFactory = createMockQueryFactory({
        responses: [],
        shouldError: true,
        errorType: 'error_during_execution',
        requireResumeForFollowUp: false,
      });
      const mockCliPrompt = createMockCliPrompt('continue');
      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
        cliPrompt: mockCliPrompt,
      });
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      // Should fail normally without prompting
      expect(result.status).toBe('failure');
      expect(mockCliPrompt.askChoice).not.toHaveBeenCalled();
    });
  });

  describe('foreground abort signal', () => {
    it('aborts mid-request when the foreground abort signal fires', async () => {
      // Create a query that blocks until externally resolved, simulating a long-running LLM call
      let resolveQuery!: () => void;
      const queryBlocked = new Promise<void>((resolve) => {
        resolveQuery = resolve;
      });

      let closed = false;
      const closeFn = vi.fn(() => {
        closed = true;
      });
      const mockFactory: QueryFactory = vi.fn(() => {
        async function* slowStream(): AsyncGenerator<SDKMessage> {
          // Emit the init message so the plugin captures the session ID
          yield {
            type: 'system',
            subtype: 'init',
            session_id: TEST_SESSION_ID,
          } as SDKMessage;

          // Block here — simulates waiting for the LLM response
          await queryBlocked;

          // After unblocking, check if close() was called (simulates real SDK behavior)
          if (closed) {
            throw new Error('Query was closed');
          }

          yield {
            type: 'assistant',
            session_id: TEST_SESSION_ID,
            message: { id: 'msg-1', content: [{ type: 'text', text: '```c\nint f() {}\n```' }] },
          } as SDKMessage;
          yield {
            type: 'result',
            subtype: 'success',
            session_id: TEST_SESSION_ID,
            is_error: false,
          } as SDKMessage;
        }

        return {
          [Symbol.asyncIterator]: () => slowStream(),
          close: closeFn,
        } as any;
      });

      const plugin = new ClaudeRunnerPlugin({
        config: defaultPluginConfig,
        pipelineConfig: defaultTestPipelineConfig,
        cCompiler: testCCompiler,
        objdiff: testObjdiff,
        queryFactory: mockFactory,
      });

      // Wire a foreground abort signal (as the PluginManager would)
      const abortController = new AbortController();
      plugin.setForegroundAbortSignal(abortController.signal);

      const context = createTestContext();

      // Start execute — it will block inside the slow query
      const executePromise = plugin.execute(context);

      // Give the async generator time to reach the blocking await
      await new Promise((r) => setTimeout(r, 50));

      // Fire the abort signal (simulates background permuter finding a match)
      abortController.abort();

      // Unblock the generator so it can observe the abort
      resolveQuery();

      const { result } = await executePromise;

      // The plugin should have failed with an abort error
      expect(result.status).toBe('failure');
      expect(result.error).toContain('background plugin found a perfect match');

      // query.close() should have been called by the abort handler
      expect(closeFn).toHaveBeenCalled();
    });
  });
});
