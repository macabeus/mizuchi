/**
 * Test Utilities
 *
 * Shared test helpers and default configurations for unit tests.
 */
import { PipelineConfig } from './config.js';
import type { PipelineContext } from './types.js';

/**
 * Default global pipeline config for tests
 */
export const defaultTestPipelineConfig: PipelineConfig = {
  contextPath: '/test/context.h',
  outputDir: '/test/output',
  maxRetries: 3,
  promptsDir: '/test/prompts',
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
    attemptNumber: 1,
    maxRetries: 3,
    config: defaultTestPipelineConfig,
    targetObjectPath: '/test/target.o',
    ...overrides,
  };
}
