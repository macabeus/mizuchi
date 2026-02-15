import fs from 'fs/promises';
import { describe, expect, it } from 'vitest';

import { createTestContext } from '~/shared/test-utils.js';

import { GetContextPlugin } from './get-context-plugin.js';

describe('GetContextPlugin', () => {
  describe('metadata', () => {
    it('has correct plugin id and name', () => {
      const plugin = new GetContextPlugin('echo "hello"');

      expect(plugin.id).toBe('get-context');
      expect(plugin.name).toBe('Get Context');
    });
  });

  describe('.execute', () => {
    it('returns empty context when script is empty', async () => {
      const plugin = new GetContextPlugin('');
      const context = createTestContext();

      const { result, context: updatedContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(updatedContext.contextContent).toBe('');
      expect(updatedContext.contextFilePath).toBe('');
    });

    it('returns empty context when script is whitespace-only', async () => {
      const plugin = new GetContextPlugin('   ');
      const context = createTestContext();

      const { result, context: updatedContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(updatedContext.contextContent).toBe('');
    });

    it('captures stdout as context content', async () => {
      const plugin = new GetContextPlugin('echo "typedef int s32;"');
      const context = createTestContext();

      const { result, context: updatedContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(updatedContext.contextContent).toBe('typedef int s32;\n');
    });

    it('writes context to a temp file', async () => {
      const plugin = new GetContextPlugin('echo "typedef int u32;"');
      const context = createTestContext();

      const { context: updatedContext } = await plugin.execute(context);

      expect(updatedContext.contextFilePath).toBeTruthy();
      const fileContent = await fs.readFile(updatedContext.contextFilePath!, 'utf-8');
      expect(fileContent).toBe('typedef int u32;\n');
    });

    it('substitutes {{functionName}} template variable', async () => {
      const plugin = new GetContextPlugin('echo "func={{functionName}}"');
      const context = createTestContext({ functionName: 'MyFunc' });

      const { context: updatedContext } = await plugin.execute(context);

      expect(updatedContext.contextContent).toBe('func=MyFunc\n');
    });

    it('substitutes {{targetObjectPath}} template variable', async () => {
      const plugin = new GetContextPlugin('echo "target={{targetObjectPath}}"');
      const context = createTestContext({ targetObjectPath: '/build/obj/foo.o' });

      const { context: updatedContext } = await plugin.execute(context);

      expect(updatedContext.contextContent).toBe('target=/build/obj/foo.o\n');
    });

    it('returns failure when script exits with non-zero code', async () => {
      const plugin = new GetContextPlugin('exit 1');
      const context = createTestContext();

      const { result, context: updatedContext } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('getContextScript failed');
      // Context should not be modified on failure
      expect(updatedContext.contextContent).toBe('');
    });

    it('returns failure when script has a command error', async () => {
      const plugin = new GetContextPlugin('cat /nonexistent/file/path');
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('getContextScript failed');
    });

    it('shows warning when script succeeds but produces no stdout', async () => {
      const plugin = new GetContextPlugin('true');
      const context = createTestContext();

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('no stdout output');
    });

    it('handles multi-line script output', async () => {
      const script = `
echo "typedef int s32;"
echo "typedef unsigned int u32;"
echo "typedef short s16;"
`;
      const plugin = new GetContextPlugin(script);
      const context = createTestContext();

      const { result, context: updatedContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(updatedContext.contextContent).toContain('typedef int s32;');
      expect(updatedContext.contextContent).toContain('typedef unsigned int u32;');
      expect(updatedContext.contextContent).toContain('typedef short s16;');
    });
  });

  describe('.getReportSections', () => {
    it('returns code section when contextContent is present', () => {
      const plugin = new GetContextPlugin('echo test');
      const result = {
        pluginId: 'get-context',
        pluginName: 'Get Context',
        status: 'success' as const,
        durationMs: 10,
        data: { contextContent: 'typedef int s32;', contextFilePath: '/tmp/ctx.h' },
      };

      const sections = plugin.getReportSections(result);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('code');
      expect(sections[0].title).toBe('Context Content');
    });

    it('returns empty sections when script is empty', () => {
      const plugin = new GetContextPlugin('');
      const result = {
        pluginId: 'get-context',
        pluginName: 'Get Context',
        status: 'success' as const,
        durationMs: 10,
        data: { contextContent: '', contextFilePath: '' },
      };

      const sections = plugin.getReportSections(result);

      expect(sections).toHaveLength(0);
    });

    it('returns error section when there is an error', () => {
      const plugin = new GetContextPlugin('exit 1');
      const result = {
        pluginId: 'get-context',
        pluginName: 'Get Context',
        status: 'failure' as const,
        durationMs: 10,
        error: 'getContextScript failed: exit code 1',
      };

      const sections = plugin.getReportSections(result);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('message');
      expect(sections[0].title).toBe('Error');
    });
  });
});
