import { describe, expect, it } from 'vitest';

import { createTestContext, defaultTestPipelineConfig } from '~/shared/test-utils.js';

import { M2cPlugin } from './m2c-plugin.js';

describe('M2cPlugin', () => {
  describe('metadata', () => {
    it('has correct plugin id and name', () => {
      const plugin = new M2cPlugin({ enable: true });

      expect(plugin.id).toBe('m2c');
      expect(plugin.name).toBe('m2c');
    });
  });

  describe('.execute', () => {
    it('decompiles a simple ARM function from context.asm', async () => {
      const plugin = new M2cPlugin({ enable: true });
      const context = createTestContext({
        functionName: 'SimpleAdd',
        asm: `.text
glabel SimpleAdd
    add r0, r1
    bx lr
`,
        contextFilePath: '',
        config: {
          ...defaultTestPipelineConfig,
          target: 'gba',
        },
      });

      const { result, context: updatedContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(result.data?.generatedCode).toContain('SimpleAdd');
      expect(updatedContext.generatedCode).toBe(result.data?.generatedCode);
      expect(updatedContext.m2cContext?.generatedCode).toBe(result.data?.generatedCode);
    });

    it('decompiles a MIPS function from context.asm', async () => {
      const plugin = new M2cPlugin({ enable: true });
      const context = createTestContext({
        functionName: 'SimpleFunc',
        asm: `.text
glabel SimpleFunc
    jr $ra
    addiu $v0, $zero, 1
`,
        contextFilePath: '',
        config: {
          ...defaultTestPipelineConfig,
          target: 'n64',
        },
      });

      const { result, context: updatedContext } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(result.data?.generatedCode).toContain('SimpleFunc');
      expect(updatedContext.generatedCode).toBe(result.data?.generatedCode);
      expect(updatedContext.m2cContext?.generatedCode).toBe(result.data?.generatedCode);
    });

    it('returns failure for unsupported target platform', async () => {
      const plugin = new M2cPlugin({ enable: true });
      const context = createTestContext({
        functionName: 'TestFunc',
        asm: `.text
glabel TestFunc
    bx lr
`,
        config: {
          ...defaultTestPipelineConfig,
          target: 'win32',
        },
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('Unsupported target platform');
    });

    it('returns failure for invalid assembly', async () => {
      const plugin = new M2cPlugin({ enable: true });
      const context = createTestContext({
        functionName: 'InvalidFunc',
        asm: `.text
glabel InvalidFunc
    this is not valid assembly
`,
        contextFilePath: '',
        config: {
          ...defaultTestPipelineConfig,
          target: 'gba',
        },
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
    });
  });

  describe('.getReportSections', () => {
    it('returns code section when generatedCode is present', () => {
      const plugin = new M2cPlugin({ enable: true });
      const result = {
        pluginId: 'm2c',
        pluginName: 'm2c',
        status: 'success' as const,
        durationMs: 100,
        data: { generatedCode: 'int f() { return 0; }' },
      };

      const sections = plugin.getReportSections(result);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('code');
      expect(sections[0].title).toBe('Generated C Code');
    });

    it('returns error section when there is an error', () => {
      const plugin = new M2cPlugin({ enable: true });
      const result = {
        pluginId: 'm2c',
        pluginName: 'm2c',
        status: 'failure' as const,
        durationMs: 100,
        error: 'm2c failed',
      };

      const sections = plugin.getReportSections(result);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('message');
      expect(sections[0].title).toBe('Error');
    });
  });
});
