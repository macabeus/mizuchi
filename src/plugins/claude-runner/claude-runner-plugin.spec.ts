import { type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it, vi } from 'vitest';

import { createTestContext, defaultTestPipelineConfig } from '~/shared/test-utils.js';

import { type ClaudeRunnerConfig, ClaudeRunnerPlugin, type QueryFactory } from './claude-runner-plugin.js';

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

      if (opts.shouldError) {
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
  systemPrompt: '',
};

describe('ClaudeRunnerPlugin', () => {
  describe('constructor', () => {
    it('creates plugin with default options', () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);

      expect(plugin.id).toBe('claude-runner');
      expect(plugin.name).toBe('Claude Runner');
      expect(plugin.description).toContain('Claude Agent SDK');
    });

    it('creates plugin with custom timeout', () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin(
        { ...defaultPluginConfig, timeoutMs: 60000 },
        defaultTestPipelineConfig,
        mockFactory,
      );

      expect(plugin.id).toBe('claude-runner');
    });
  });

  describe('.execute', () => {
    it('extracts C code from response with code block', async () => {
      const cCode = 'int testFunc(void) {\n  return 42;\n}';
      const response = `Here is the code:\n\n\`\`\`c\n${cCode}\n\`\`\``;

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext();

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(newContext.generatedCode).toBe(cCode);
    });

    it('fails when no prompt content is provided', async () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext({ promptContent: undefined });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('No prompt content');
    });

    it('fails when no C code can be extracted', async () => {
      const response = 'I cannot help with that request.';

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('Could not extract C code');
    });

    it('fails when code has unbalanced braces', async () => {
      const response = '```c\nint foo(void) {\n  return 1;\n```';

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('Missing braces');
    });

    it('fails when code has no function definition', async () => {
      const response = '```c\ntypedef struct { int x; } Foo;\n```';

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext();

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(newContext.generatedCode).not.toContain('typedef struct');
      expect(newContext.generatedCode).toContain('void movePoint');
    });

    it('reports duration in result', async () => {
      const response = '```c\nint foo(void) { return 1; }\n```';

      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext({ attemptNumber: 2 });

      const previousAttempts = [
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 2;', fromCache: false },
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext({ attemptNumber: 2 });

      const previousAttempts = [
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 2; }', fromCache: false },
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext();

      const newContext = plugin.prepareRetry!(context, []);

      expect(newContext).toEqual(context);
    });

    it('returns context unchanged when no claude result in previous attempt', () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
            data: { generatedCode: 'int foo(void) { return 1; }', fromCache: false },
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
            data: { generatedCode: 'int foo(void) { return 2; }', fromCache: false },
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
      const chatSection = sections.find((s) => s.type === 'chat');

      expect(chatSection).toBeDefined();
      expect(chatSection?.type).toBe('chat');

      if (chatSection?.type === 'chat') {
        // Should have 4 messages: initial user, initial assistant, follow-up user, follow-up assistant
        expect(chatSection.messages.length).toBe(4);

        // The third message should be the follow-up user message with reminder
        const followUpMessage = chatSection.messages[2];
        expect(followUpMessage.role).toBe('user');
        expect(typeof followUpMessage.content).toBe('string');

        if (typeof followUpMessage.content === 'string') {
          // Verify the reminder is included in the follow-up
          expect(followUpMessage.content).toContain('Reminder');
          expect(followUpMessage.content).toContain('int foo(void) { return 1; }');
          expect(followUpMessage.content).toContain('5 mismatches');
        }
      }
    });

    it('does not trigger reminder logic when last attempt is better', () => {
      const mockFactory = createMockQueryFactory(['test']);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext();

      const previousAttempts = [
        // Attempt 1: compiled successfully with 10 mismatches
        {
          'claude-runner': {
            pluginId: 'claude-runner',
            pluginName: 'Claude Runner',
            status: 'success' as const,
            durationMs: 100,
            data: { generatedCode: 'int foo(void) { return 1; }', fromCache: false },
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
            data: { generatedCode: 'int foo(void) { return 2; }', fromCache: false },
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
            data: { generatedCode: 'int foo(void) { return 99', fromCache: false },
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
      const chatSection = sections.find((s) => s.type === 'chat');

      expect(chatSection).toBeDefined();
      expect(chatSection?.type).toBe('chat');

      if (chatSection?.type === 'chat') {
        // Should have 4 messages: initial user, initial assistant, follow-up user, follow-up assistant
        expect(chatSection.messages.length).toBe(4);

        // The third message should be the follow-up user message with compilation error
        const followUpMessage = chatSection.messages[2];
        expect(followUpMessage.role).toBe('user');
        expect(typeof followUpMessage.content).toBe('string');

        if (typeof followUpMessage.content === 'string') {
          // Verify the compilation error is mentioned
          expect(followUpMessage.content).toContain("expected '}'");
          expect(followUpMessage.content).toContain('failed to compile');
        }
      }
    });

    it('asks for C code when previous response had no code', async () => {
      const response1 = '```c\nint foo(void) { return 1; }\n```';
      const response2 = '```c\nint foo(void) { return 42; }\n```';
      const mockFactory = createMockQueryFactory([response1, response2]);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
            data: { generatedCode: undefined, fromCache: false },
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
      const chatSection = sections.find((s) => s.type === 'chat');

      expect(chatSection).toBeDefined();
      expect(chatSection?.type).toBe('chat');

      if (chatSection?.type === 'chat') {
        // Should have 4 messages: initial user, initial assistant, follow-up user, follow-up assistant
        expect(chatSection.messages.length).toBe(4);

        // The third message should be the follow-up user message asking for C code
        const followUpMessage = chatSection.messages[2];
        expect(followUpMessage.role).toBe('user');
        expect(typeof followUpMessage.content).toBe('string');

        if (typeof followUpMessage.content === 'string') {
          // Verify it asks for C code
          expect(followUpMessage.content).toContain('Please provide only the C code');
        }
      }
    });
  });

  describe('session continuity', () => {
    it('creates new session for initial attempt', async () => {
      const response = '```c\nint foo(void) { return 1; }\n```';
      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext();

      await plugin.execute(context);

      expect(mockFactory).toHaveBeenCalledTimes(1);
    });

    it('reuses session for retry attempts', async () => {
      const response1 = '```c\nint foo(void) { return 1; }\n```';
      const response2 = '```c\nint foo(void) { return 2; }\n```';
      const mockFactory = createMockQueryFactory([response1, response2]);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
            data: { generatedCode: 'int foo(void) { return 1; }', fromCache: false },
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);

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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
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

  describe('getReportSections', () => {
    it('returns chat section with conversation history', async () => {
      const response = '```c\nint foo(void) { return 1; }\n```';
      const mockFactory = createMockQueryFactory([response]);
      const plugin = new ClaudeRunnerPlugin(defaultPluginConfig, defaultTestPipelineConfig, mockFactory);
      const context = createTestContext();

      const { result } = await plugin.execute(context);
      const sections = plugin.getReportSections!(result, context);

      // Should have chat section
      const chatSection = sections.find((s) => s.type === 'chat');
      expect(chatSection).toBeDefined();
      expect(chatSection?.type).toBe('chat');
      if (chatSection?.type === 'chat') {
        expect(chatSection.messages.length).toBeGreaterThan(0);
        expect(chatSection.messages[0].role).toBe('user');
        expect(chatSection.messages[1].role).toBe('assistant');
      }

      // Should also have code section
      const codeSection = sections.find((s) => s.type === 'code');
      expect(codeSection).toBeDefined();
    });
  });
});
