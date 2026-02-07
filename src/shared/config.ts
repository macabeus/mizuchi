/**
 * Configuration System
 *
 * Provides YAML-based configuration with separate global and plugin-specific settings.
 */
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { z } from 'zod';

/**
 * Supported platform targets
 */
export const platformTargets = [
  'gba',
  'nds',
  'n3ds',
  'n64',
  'gc',
  'wii',
  'ps1',
  'ps2',
  'psp',
  'win32',
  'switch',
  'android_x86',
  'irix',
  'saturn',
  'dreamcast',
] as const;
export type PlatformTarget = (typeof platformTargets)[number];

/**
 * Global pipeline configuration schema
 *
 * These are the top-level settings that apply to the entire pipeline run.
 */
export const pipelineConfigSchema = z.object({
  maxRetries: z.number().positive().default(25),
  outputDir: z.string().default('.'),
  compilerFlags: z.string().default(''),
  contextPath: z.string(),
  promptsDir: z.string(),
  target: z.enum(platformTargets).default('gba'),
});

export type PipelineConfig = z.infer<typeof pipelineConfigSchema>;

/**
 * Full configuration file schema
 */
export const configFileSchema = z.object({
  global: pipelineConfigSchema,
  plugins: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

export type ConfigFile = z.infer<typeof configFileSchema>;

/**
 * Plugin configuration requirement
 */
export interface PluginConfigRequirement<T extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Zod schema for the plugin's configuration */
  schema: T;
  /** Description of the configuration for documentation */
  description?: string;
}

/**
 * Plugin configuration declaration - each plugin must provide this
 */
export type PluginConfigSchema<T extends z.ZodRawShape> = z.ZodObject<T>;

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly pluginId?: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Get the default config file path
 */
export function getDefaultConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, 'mizuchi.yaml');
}

/**
 * Load and parse the configuration file
 */
export async function loadConfig(configPath: string): Promise<ConfigFile> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = YAML.parse(content);

    // Validate the structure
    const result = configFileSchema.safeParse(parsed);

    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new ConfigValidationError(`Invalid configuration file: ${issues}`);
    }

    return result.data;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }

    // File not found or parse error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigValidationError(`Configuration file not found: ${configPath}`);
    }

    if (error instanceof YAML.YAMLParseError) {
      throw new ConfigValidationError(`Invalid YAML syntax: ${error.message}`);
    }

    throw new ConfigValidationError(`Failed to load configuration: ${(error as Error).message}`);
  }
}

/**
 * Validate plugin configuration against its schema
 */
export function validatePluginConfig<T extends z.ZodTypeAny>(pluginId: string, config: unknown, schema: T): z.infer<T> {
  const result = schema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => {
        const field = i.path.join('.');
        return field ? `'${field}': ${i.message}` : i.message;
      })
      .join(', ');

    throw new ConfigValidationError(`Invalid configuration for plugin '${pluginId}': ${issues}`, pluginId);
  }

  return result.data;
}

/**
 * Get plugin configuration from the config file
 */
export function getPluginConfig<T extends z.ZodTypeAny>(config: ConfigFile, pluginId: string, schema: T): z.infer<T> {
  const pluginConfig = config.plugins[pluginId] ?? {};
  return validatePluginConfig(pluginId, pluginConfig, schema);
}

/**
 * Check if a configuration file exists
 */
export async function configExists(configPath: string): Promise<boolean> {
  try {
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}
