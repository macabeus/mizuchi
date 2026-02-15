/**
 * Test Utilities
 *
 * Shared test helpers and default configurations for unit tests.
 */
import { getArmCompilerScript } from './c-compiler/__fixtures__/index.js';
import { PipelineConfig } from './config.js';
import type { PipelineContext } from './types.js';

/**
 * Default global pipeline config for tests
 */
export const defaultTestPipelineConfig: PipelineConfig = {
  getContextScript: 'echo ""',
  outputDir: '/test/output',
  compilerScript: getArmCompilerScript(),
  maxRetries: 3,
  promptsDir: '/test/prompts',
  target: 'gba',
};

/**
 * Create a test pipeline context with default values
 *
 * Only override the values specific to your test.
 *
 * @example
 * const context = createTestContext({ functionName: 'myFunc' });
 */
export function createTestContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    promptPath: 'test.md',
    promptContent: 'Test prompt content',
    functionName: 'testFunc',
    asm: '.text\nglabel testFunc\n    bx lr\n',
    attemptNumber: 1,
    maxRetries: 3,
    config: defaultTestPipelineConfig,
    targetObjectPath: '/test/target.o',
    contextContent: '',
    contextFilePath: '',
    ...overrides,
  };
}
