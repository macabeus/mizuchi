/**
 * CLI Configuration Utilities
 *
 * Handles loading and validating configuration for the CLI.
 */
import fs from 'fs/promises';
import path from 'path';

import {
  type ConfigFile,
  PipelineConfig,
  configExists,
  getDefaultConfigPath,
  getPluginConfig,
  loadConfig,
} from '~/shared/config.js';

/**
 * Get the config file path (custom or default)
 */
export function getConfigFilePath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }

  return getDefaultConfigPath();
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
 * Build the full pipeline configuration from CLI options and config file.
 *
 * `projectRoot` is already resolved by `loadConfig()` from the config file's directory.
 * CLI options can override specific fields.
 */
export function buildPipelineConfig(
  fileConfig: ConfigFile,
  cliOptions: {
    prompts?: string;
    retries?: number;
    output?: string;
  },
): PipelineConfig {
  const global = fileConfig.global as PipelineConfig;

  const pipelineConfig: PipelineConfig = {
    ...global,
    maxRetries: cliOptions.retries ?? global.maxRetries,
    promptsDir: cliOptions.prompts ? path.resolve(cliOptions.prompts) : global.promptsDir,
    outputDir: cliOptions.output ? path.resolve(cliOptions.output) : global.outputDir,
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
