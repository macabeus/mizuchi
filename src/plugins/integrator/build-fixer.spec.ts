import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueryFactory } from '~/shared/types.js';

import { type BuildFixOptions, attemptBuildFix } from './build-fixer.js';

/**
 * Creates a mock query factory that returns scripted SDK messages.
 */
function createMockQueryFactory(messages: SDKMessage[]): QueryFactory {
  return vi.fn((_prompt: string, _options: { model?: string }) => {
    async function* generateMessages(): AsyncGenerator<SDKMessage> {
      yield { type: 'system', subtype: 'init', session_id: 'test-session' } as SDKMessage;
      for (const msg of messages) {
        yield msg;
      }
      yield { type: 'result', subtype: 'success', session_id: 'test-session' } as SDKMessage;
    }
    const gen = generateMessages();
    return Object.assign(gen, { close: vi.fn() });
  }) as unknown as QueryFactory;
}

describe('attemptBuildFix', () => {
  let worktreePath: string;

  beforeEach(() => {
    worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuchi-buildfixer-'));
  });

  afterEach(() => {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  });

  function defaultOptions(overrides: Partial<BuildFixOptions> = {}): BuildFixOptions {
    return {
      worktreePath,
      buildError: 'error: redefinition of foo',
      filesModified: ['src/math.c'],
      functionName: 'FUN_08000960',
      generatedCode: 's16 FUN_08000960(s32 a) { return a; }',
      verifyBuildCommand: 'true', // shell builtin that always succeeds
      timeoutMs: 30_000,
      ...overrides,
    };
  }

  it('returns fixed=true when build passes after AI fix', async () => {
    const mockFactory = createMockQueryFactory([
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'I found the issue. Removing duplicate declaration.' }],
        },
      } as SDKMessage,
    ]);

    const result = await attemptBuildFix(defaultOptions({ queryFactory: mockFactory }));

    expect(result.fixed).toBe(true);
    expect(result.systemPrompt).toContain('FUN_08000960');
    // Chat history: user prompt + assistant response
    expect(result.chatHistory).toHaveLength(2);
    expect(result.chatHistory[0].role).toBe('user');
    expect(result.chatHistory[0].content).toBe('Please fix the build errors described above.');
    expect(result.chatHistory[1].role).toBe('assistant');
    // No tool calls → plain text content
    expect(result.chatHistory[1].content).toBe('I found the issue. Removing duplicate declaration.');
  });

  it('returns fixed=false when build still fails after AI fix', async () => {
    const mockFactory = createMockQueryFactory([
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'Attempting to fix...' }],
        },
      } as SDKMessage,
    ]);

    const result = await attemptBuildFix(
      defaultOptions({
        queryFactory: mockFactory,
        verifyBuildCommand: 'exit 1', // always fails
      }),
    );

    expect(result.fixed).toBe(false);
    expect(result.chatHistory).toHaveLength(2);
    expect(result.chatHistory[0].role).toBe('user');
    expect(result.chatHistory[1].role).toBe('assistant');
  });

  it('returns fixed=false on timeout with partial chat history preserved', async () => {
    // Create a factory that takes too long
    const mockFactory = vi.fn((_prompt: string, _options: { model?: string }) => {
      let closed = false;
      async function* generateMessages(): AsyncGenerator<SDKMessage> {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session',
        } as SDKMessage;
        yield {
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [{ type: 'text', text: 'Starting fix...' }],
          },
        } as SDKMessage;
        // Simulate a long-running query that will be aborted
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (!closed) {
          yield {
            type: 'result',
            subtype: 'success',
            session_id: 'test-session',
          } as SDKMessage;
        }
      }
      const gen = generateMessages();
      return Object.assign(gen, {
        close: vi.fn(() => {
          closed = true;
          gen.return(undefined as unknown as SDKMessage);
        }),
      });
    }) as unknown as QueryFactory;

    const result = await attemptBuildFix(
      defaultOptions({
        queryFactory: mockFactory,
        timeoutMs: 100, // Very short timeout
        verifyBuildCommand: 'exit 1',
      }),
    );

    expect(result.fixed).toBe(false);
    // Should have the user prompt + partial assistant content
    expect(result.chatHistory.length).toBeGreaterThan(0);
  });

  it('collects tool_use and tool_result in a single assistant message', async () => {
    const mockFactory = createMockQueryFactory([
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            { type: 'text', text: 'Let me read the file.' },
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/src/math.c' } },
          ],
        },
      } as SDKMessage,
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'file contents here' }],
        },
      } as SDKMessage,
      {
        type: 'assistant',
        message: {
          id: 'msg-2',
          content: [{ type: 'text', text: 'Fixed!' }],
        },
      } as SDKMessage,
    ]);

    const result = await attemptBuildFix(defaultOptions({ queryFactory: mockFactory }));

    expect(result.fixed).toBe(true);
    // user prompt + single assistant message with ALL content blocks
    expect(result.chatHistory).toHaveLength(2);
    expect(result.chatHistory[0].role).toBe('user');
    expect(result.chatHistory[0].content).toBe('Please fix the build errors described above.');
    expect(result.chatHistory[1].role).toBe('assistant');

    // All blocks (text, tool_use, tool_result, text) in a single assistant message
    const blocks = result.chatHistory[1].content;
    expect(Array.isArray(blocks)).toBe(true);
    if (Array.isArray(blocks)) {
      expect(blocks).toHaveLength(4);
      expect(blocks[0]).toEqual({ type: 'text', text: 'Let me read the file.' });
      expect(blocks[1]).toEqual({
        type: 'tool_use',
        id: 'tu-1',
        name: 'Read',
        input: { file_path: '/src/math.c' },
      });
      expect(blocks[2]).toEqual({
        type: 'tool_result',
        tool_use_id: 'tu-1',
        content: 'file contents here',
      });
      expect(blocks[3]).toEqual({ type: 'text', text: 'Fixed!' });
    }
  });

  it('handles query errors gracefully', async () => {
    const mockFactory = createMockQueryFactory([
      {
        type: 'result',
        subtype: 'error',
        errors: ['Internal error'],
        session_id: 'test-session',
      } as unknown as SDKMessage,
    ]);

    const result = await attemptBuildFix(defaultOptions({ queryFactory: mockFactory }));

    // Should have user prompt + error
    expect(result.chatHistory[0].role).toBe('user');
    const errorMsg = result.chatHistory.find((m) => m.role === 'error');
    expect(errorMsg).toBeTruthy();
    expect(typeof errorMsg?.content === 'string' && errorMsg.content).toContain('Internal error');
  });

  it('includes system prompt in result', async () => {
    const mockFactory = createMockQueryFactory([
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'Done.' }],
        },
      } as SDKMessage,
    ]);

    const result = await attemptBuildFix(defaultOptions({ queryFactory: mockFactory }));

    expect(result.systemPrompt).toContain('FUN_08000960');
    expect(result.systemPrompt).toContain('error: redefinition of foo');
    expect(result.systemPrompt).toContain('src/math.c');
  });
});
