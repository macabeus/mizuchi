import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestContext, defaultTestPipelineConfig } from '~/shared/test-utils.js';
import type { PipelineContext } from '~/shared/types.js';

import { CompilerPlugin } from './compiler-plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CompilerPlugin', () => {
  let plugin: CompilerPlugin;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    plugin = new CompilerPlugin({}, defaultTestPipelineConfig);
  });

  afterEach(async () => {
    // Clean up any generated files
    await plugin.cleanup();
  });

  const createContext = (overrides: Partial<PipelineContext> = {}): PipelineContext =>
    createTestContext({
      functionName: 'TestFunc',
      ...overrides,
    });

  describe('.execute', () => {
    it('fails when no generated code in context', async () => {
      const context = createContext({ generatedCode: undefined });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toBe('No generated code to compile');
      expect(result.pluginId).toBe('compiler');
      expect(result.pluginName).toBe('Compiler');
    });

    it('succeeds when compiling valid C code', async () => {
      const validCCode = `
void TestFunc(void) {
    volatile int x = 1;
    x = x + 1;
}
`;
      const context = createContext({ generatedCode: validCCode });

      const { result, context: newContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(result.output).toContain('Successfully compiled');
      expect(result.data?.objectFilePath).toMatch(/TestFunc\.o$/);
      expect(newContext.compiledObjectPath).toMatch(/TestFunc\.o$/);
    });

    it('fails when compiling invalid C code with syntax error', async () => {
      const invalidCode = `
void BrokenFunc(void) {
    this is not valid C code!!!
}
`;
      const context = createContext({ generatedCode: invalidCode });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toBe('Compilation failed');
    });

    it('fails when compiling code with undefined reference', async () => {
      const codeWithUndefinedRef = `
void UndefinedRefFunc(void) {
    undefined_function();
}
`;
      const context = createContext({ generatedCode: codeWithUndefinedRef });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toBeDefined();
    });

    it('records duration in result', async () => {
      const validCode = `
void DurationTest(void) {
    int x = 1;
}
`;
      const context = createContext({ generatedCode: validCode });

      const { result } = await plugin.execute(context);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('compiles code with includes from context.h', async () => {
      // Create a temporary context.h file with type definitions
      const tempContextPath = path.join(__dirname, 'test-context.h');
      const contextContent = `
typedef unsigned int u32;
typedef signed short s16;
typedef int bool32;
`;
      await fs.writeFile(tempContextPath, contextContent);

      const codeWithTypes = `
void TypesTest(void) {
    u32 x = 0;
    s16 y = -1;
    bool32 flag = 1;
}
`;
      const context = createContext({
        generatedCode: codeWithTypes,
        config: {
          ...defaultTestPipelineConfig,
          contextPath: tempContextPath,
        },
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('success');

      // Clean up the temporary context file
      await fs.unlink(tempContextPath);
    });
  });

  describe('.cleanup', () => {
    it('removes generated files', async () => {
      // First compile something to generate files
      const validCode = `
void CleanupTest(void) {
    int x = 1;
}
`;
      const context = createContext({ generatedCode: validCode });
      await plugin.execute(context);

      // Run cleanup
      await plugin.cleanup();

      // Verify files are removed
      const filesAfterCleanup = await fs.readdir(__dirname);
      expect(filesAfterCleanup).not.toContain('base.c');
      expect(filesAfterCleanup).not.toContain('base.o');
      expect(filesAfterCleanup).not.toContain('base.s');
    });

    it('does not throw when files do not exist', async () => {
      await expect(plugin.cleanup()).resolves.not.toThrow();
    });
  });
});
