import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigFile } from '~/shared/config.js';

import { buildPipelineConfig, getConfigFilePath, getDefaultConfig, loadConfigFile, validatePaths } from './config.js';

describe('CLI Config', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('getDefaultConfig', () => {
    it('returns a valid PipelineConfig with defaults', () => {
      const config = getDefaultConfig();

      expect(config.promptsDir).toBeDefined();
      expect(config.maxRetries).toBe(25);
      expect(config.outputDir).toBeDefined();
    });
  });

  describe('getConfigFilePath', () => {
    it('returns custom path when provided', () => {
      const customPath = '/custom/path/config.yaml';
      const result = getConfigFilePath(customPath);

      expect(result).toBe(customPath);
    });

    it('returns default mizuchi.yaml path when no custom path', () => {
      const result = getConfigFilePath();

      expect(result).toContain('mizuchi.yaml');
    });
  });

  describe('loadConfigFile', () => {
    it('returns null for non-existent file', async () => {
      const result = await loadConfigFile('/non/existent/path.yaml');

      expect(result).toBeNull();
    });

    it('loads a valid YAML config file', async () => {
      const configPath = path.join(tempDir, 'mizuchi.yaml');
      const configContent = `
global:
  contextPath: "/custom/context.h"
  maxRetries: 10
  outputDir: "/custom/output"
  promptsDir: "/custom/prompts"

plugins:
  claude-runner:
    projectPath: "/decomp/myproject"
`;
      await fs.writeFile(configPath, configContent);

      const config = await loadConfigFile(configPath);

      expect(config).not.toBeNull();
      expect(config!.global.maxRetries).toBe(10);
      expect(config!.global.outputDir).toBe('/custom/output');
      expect(config!.global.promptsDir).toBe('/custom/prompts');
    });

    it('applies defaults for missing global fields', async () => {
      const configPath = path.join(tempDir, 'minimal.yaml');
      const configContent = `
global:
  contextPath: "/custom/context.h"
  promptsDir: "/custom/prompts"

plugins:
  claude-runner:
    projectPath: "/decomp/myproject"
`;
      await fs.writeFile(configPath, configContent);

      const config = await loadConfigFile(configPath);

      expect(config).not.toBeNull();
      expect(config!.global.maxRetries).toBe(25);
      expect(config!.global.outputDir).toBe('.');
    });
  });

  describe('buildPipelineConfig', () => {
    it('uses file config when no CLI overrides', () => {
      const fileConfig: ConfigFile = {
        global: {
          contextPath: '',
          maxRetries: 10,
          outputDir: '/custom/output',
          compilerFlags: '-mthumb-interwork -Wimplicit -Wparentheses -Werror -O2 -fhex-asm',
          promptsDir: '/custom/prompts',
        },
        plugins: {
          'claude-runner': { projectPath: '/decomp/myproject' },
        },
      };

      const pipelineConfig = buildPipelineConfig(fileConfig, {});

      expect(pipelineConfig.maxRetries).toBe(10);
      expect(pipelineConfig.outputDir).toBe('/custom/output');
      expect(pipelineConfig.promptsDir).toBe('/custom/prompts');
    });

    it('CLI options override file config', () => {
      const fileConfig: ConfigFile = {
        global: {
          contextPath: '',
          maxRetries: 10,
          outputDir: '/custom/output',
          compilerFlags: '-mthumb-interwork -Wimplicit -Wparentheses -Werror -O2 -fhex-asm',
          promptsDir: '/custom/prompts',
        },
        plugins: {
          'claude-runner': { projectPath: '/decomp/myproject' },
        },
      };

      const pipelineConfig = buildPipelineConfig(fileConfig, {
        prompts: '/cli/prompts',
        retries: 3,
        output: '/cli/output',
      });

      expect(pipelineConfig.maxRetries).toBe(3);
      expect(pipelineConfig.outputDir).toContain('cli/output');
      expect(pipelineConfig.promptsDir).toContain('cli/prompts');
    });
  });

  describe('validatePaths', () => {
    it('succeeds when prompts directory exists', async () => {
      const promptsDir = path.join(tempDir, 'prompts');
      const outputDir = path.join(tempDir, 'output');
      const contextPath = path.join(tempDir, 'context.h');

      await fs.mkdir(promptsDir);
      await fs.mkdir(outputDir);
      await fs.writeFile(contextPath, '// test context');

      const config = {
        ...getDefaultConfig(),
        promptsDir,
        outputDir,
        contextPath,
      };

      const result = await validatePaths(config);
      expect(result.errors).toEqual([]);
    });

    it('returns errors when prompts directory does not exist', async () => {
      const contextPath = path.join(tempDir, 'context.h');
      await fs.writeFile(contextPath, '// test context');

      const config = {
        ...getDefaultConfig(),
        contextPath,
        promptsDir: '/non/existent/prompts',
        outputDir: tempDir,
      };

      const result = await validatePaths(config);
      expect(result.errors).toContain('Prompts directory not found: /non/existent/prompts');
    });

    it('creates output directory if it does not exist', async () => {
      const promptsDir = path.join(tempDir, 'prompts');
      const outputDir = path.join(tempDir, 'new-output');
      const contextPath = path.join(tempDir, 'context.h');

      await fs.mkdir(promptsDir);
      await fs.writeFile(contextPath, '// test context');

      const config = {
        ...getDefaultConfig(),
        promptsDir,
        outputDir,
        contextPath,
      };

      const result = await validatePaths(config);
      expect(result.errors).toEqual([]);

      const stat = await fs.stat(outputDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });
});
