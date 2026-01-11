/**
 * CLI Configuration Utilities
 *
 * Handles loading and validating configuration for the CLI.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

import {
  type ConfigFile,
  PipelineConfig,
  configExists,
  getDefaultConfigPath,
  getPluginConfig,
  loadConfig,
  pipelineConfigSchema,
} from '~/shared/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get project root directory
 */
export function getProjectRoot(): string {
  return path.resolve(__dirname, '../..');
}

/**
 * Get the config file path (custom or default)
 */
export function getConfigFilePath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }

  return getDefaultConfigPath(getProjectRoot());
}

/**
 * Pipeline configuration schema with defaults based on project root
 */
export function createPipelineConfigSchema(projectRoot: string) {
  return pipelineConfigSchema
    .extend({
      promptsDir: z.string().default(projectRoot),
    })
    .transform((config) => ({
      ...config,
      // Apply project-relative defaults for paths that weren't explicitly set
      contextPath: config.contextPath || path.join(projectRoot, 'context.h'),
      outputDir: config.outputDir === '.' ? projectRoot : config.outputDir,
    }));
}

/**
 * Get default configuration values using Zod schema defaults
 */
export function getDefaultConfig(): PipelineConfig {
  const projectRoot = getProjectRoot();
  const schema = createPipelineConfigSchema(projectRoot);

  // Parse an object with only contextPath (required) to get all defaults
  return schema.parse({ contextPath: path.join(projectRoot, 'context.h') });
}

/**
 * Load configuration from YAML file
 */
export async function loadConfigFile(configPath: string): Promise<ConfigFile | null> {
  const exists = await configExists(configPath);
  if (!exists) {
    return null;
  }
  return loadConfig(configPath);
}

/**
 * Build the full pipeline configuration from CLI options and config file
 */
export function buildPipelineConfig(
  fileConfig: ConfigFile,
  cliOptions: {
    prompts?: string;
    retries?: number;
    output?: string;
  },
): PipelineConfig {
  const defaults = getDefaultConfig();

  const pipelineConfig: PipelineConfig = {
    contextPath: fileConfig.global?.contextPath ?? defaults.contextPath,
    outputDir: cliOptions.output
      ? path.resolve(cliOptions.output)
      : (fileConfig.global?.outputDir ?? defaults.outputDir),
    maxRetries: cliOptions.retries ?? fileConfig.global?.maxRetries ?? defaults.maxRetries,
    promptsDir: cliOptions.prompts ?? fileConfig.global?.promptsDir ?? defaults.promptsDir,
  };

  return pipelineConfig;
}

/**
 * Get plugin-specific configuration from config file
 */
export function getPluginConfigFromFile<T>(
  fileConfig: ConfigFile,
  pluginId: string,
  schema: import('zod').ZodTypeAny,
): T {
  return getPluginConfig(fileConfig, pluginId, schema) as T;
}

/**
 * Validate that required paths and files exist
 */
export async function validatePaths(config: PipelineConfig): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  try {
    await fs.access(config.contextPath);
  } catch {
    errors.push(`Context file not found: ${config.contextPath}`);
  }

  try {
    await fs.access(config.promptsDir);
  } catch {
    errors.push(`Prompts directory not found: ${config.promptsDir}`);
  }

  try {
    await fs.access(config.outputDir);
  } catch {
    try {
      await fs.mkdir(config.outputDir, { recursive: true });
    } catch {
      errors.push(`Failed to create output directory: ${config.outputDir}`);
    }
  }

  return { errors };
}
