import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildPipelineConfig, getConfigFilePath, loadConfigFile, validatePaths } from './config.js';

describe('CLI Config', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
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

    it('loads a valid YAML config file and resolves paths relative to config dir', async () => {
      const configPath = path.join(tempDir, 'mizuchi.yaml');
      const configContent = `
global:
  getContextScript: "cat context.h"
  compilerScript: "echo test"
  maxRetries: 10
  outputDir: "./output"
  promptsDir: "./prompts"
  mapFilePath: "build/myproject.map"
  nonMatchingAsmFolders:
    - asm
`;
      await fs.writeFile(configPath, configContent);

      const config = await loadConfigFile(configPath);

      expect(config).not.toBeNull();
      expect(config!.global.maxRetries).toBe(10);
      // Paths should be resolved relative to the config file's directory
      expect(config!.global.outputDir).toBe(path.join(tempDir, 'output'));
      expect(config!.global.promptsDir).toBe(path.join(tempDir, 'prompts'));
      expect(config!.global.mapFilePath).toBe(path.join(tempDir, 'build/myproject.map'));
      expect((config!.global as any).projectRoot).toBe(tempDir);
    });

    it('applies defaults for missing global fields', async () => {
      const configPath = path.join(tempDir, 'minimal.yaml');
      const configContent = `
global:
  getContextScript: "cat context.h"
  compilerScript: "echo test"
  mapFilePath: "myproject.map"
  nonMatchingAsmFolders:
    - asm
`;
      await fs.writeFile(configPath, configContent);

      const config = await loadConfigFile(configPath);

      expect(config).not.toBeNull();
      expect(config!.global.maxRetries).toBe(25);
    });
  });

  describe('buildPipelineConfig', () => {
    it('uses file config when no CLI overrides', async () => {
      const configPath = path.join(tempDir, 'mizuchi.yaml');
      await fs.writeFile(
        configPath,
        `
global:
  getContextScript: ""
  compilerScript: "echo test"
  maxRetries: 10
  outputDir: "./output"
  promptsDir: "./prompts"
  mapFilePath: "myproject.map"
  nonMatchingAsmFolders: []
`,
      );

      const fileConfig = await loadConfigFile(configPath);
      const pipelineConfig = buildPipelineConfig(fileConfig!, {});

      expect(pipelineConfig.maxRetries).toBe(10);
      expect(pipelineConfig.outputDir).toBe(path.join(tempDir, 'output'));
      expect(pipelineConfig.promptsDir).toBe(path.join(tempDir, 'prompts'));
      expect(pipelineConfig.projectRoot).toBe(tempDir);
    });

    it('CLI options override file config', async () => {
      const configPath = path.join(tempDir, 'mizuchi.yaml');
      await fs.writeFile(
        configPath,
        `
global:
  getContextScript: ""
  compilerScript: "echo test"
  maxRetries: 10
  outputDir: "./output"
  promptsDir: "./prompts"
  mapFilePath: "myproject.map"
  nonMatchingAsmFolders: []
`,
      );

      const fileConfig = await loadConfigFile(configPath);
      const pipelineConfig = buildPipelineConfig(fileConfig!, {
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

      await fs.mkdir(promptsDir);
      await fs.mkdir(outputDir);

      const config = {
        getContextScript: '',
        compilerScript: '',
        maxRetries: 3,
        promptsDir,
        outputDir,
        projectRoot: tempDir,
        target: 'gba' as const,
        mapFilePath: '',
        nonMatchingAsmFolders: [] as string[],
        matchingAsmFolders: [] as string[],
        excludeFromScan: ['tools'],
      };

      const result = await validatePaths(config);
      expect(result.errors).toEqual([]);
    });

    it('returns errors when prompts directory does not exist', async () => {
      const config = {
        getContextScript: '',
        compilerScript: '',
        maxRetries: 3,
        promptsDir: '/non/existent/prompts',
        outputDir: tempDir,
        projectRoot: tempDir,
        target: 'gba' as const,
        mapFilePath: '',
        nonMatchingAsmFolders: [] as string[],
        matchingAsmFolders: [] as string[],
        excludeFromScan: ['tools'],
      };

      const result = await validatePaths(config);
      expect(result.errors).toContain('Prompts directory not found: /non/existent/prompts');
    });

    it('creates output directory if it does not exist', async () => {
      const promptsDir = path.join(tempDir, 'prompts');
      const outputDir = path.join(tempDir, 'new-output');

      await fs.mkdir(promptsDir);

      const config = {
        getContextScript: '',
        compilerScript: '',
        maxRetries: 3,
        promptsDir,
        outputDir,
        projectRoot: tempDir,
        target: 'gba' as const,
        mapFilePath: '',
        nonMatchingAsmFolders: [] as string[],
        matchingAsmFolders: [] as string[],
        excludeFromScan: ['tools'],
      };

      const result = await validatePaths(config);
      expect(result.errors).toEqual([]);

      const stat = await fs.stat(outputDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });
});
