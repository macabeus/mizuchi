/**
 * Prompt Loader
 *
 * Discovers and loads prompts from the prompts directory.
 * Each prompt lives in its own folder with:
 *   - prompt.md: The prompt content
 *   - settings.yaml: Structured metadata (functionName, targetObjectPath, etc.)
 */
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import YAML from 'yaml';
import { z } from 'zod';

const execAsync = promisify(exec);

/**
 * Schema for per-prompt settings.yaml
 */
const promptSettingsSchema = z.object({
  functionName: z.string().describe('Name of the function to decompile'),
  targetObjectPath: z.string().describe('Path to the target object file for this prompt'),
  asm: z.string().describe('GAS-formatted assembly for the function'),
});

/**
 * Prompt information loaded from a prompt folder
 */
export interface PromptInfo {
  /** Path to the prompt folder (relative to promptsDir) */
  path: string;
  /** Content of prompt.md */
  content: string;
  /** Function name from settings.yaml */
  functionName: string;
  /** Target object path from settings.yaml */
  targetObjectPath: string;
  /** GAS-formatted assembly for the function */
  asm: string;
}

/**
 * Error thrown when a prompt folder is invalid
 */
export class PromptLoadError extends Error {
  constructor(
    public readonly promptPath: string,
    message: string,
  ) {
    super(`Error loading prompt '${promptPath}': ${message}`);
    this.name = 'PromptLoadError';
  }
}

/**
 * Load a single prompt from a directory
 */
async function loadPromptFromDir(promptsDir: string, dirName: string): Promise<PromptInfo> {
  const promptDir = path.join(promptsDir, dirName);
  const promptMdPath = path.join(promptDir, 'prompt.md');
  const settingsPath = path.join(promptDir, 'settings.yaml');

  // Check that prompt.md exists
  try {
    await fs.access(promptMdPath);
  } catch {
    throw new PromptLoadError(dirName, 'Missing prompt.md file');
  }

  // Check that settings.yaml exists
  try {
    await fs.access(settingsPath);
  } catch {
    throw new PromptLoadError(dirName, 'Missing settings.yaml file');
  }

  // Load prompt content
  const content = await fs.readFile(promptMdPath, 'utf-8');

  // Load and validate settings
  const settingsContent = await fs.readFile(settingsPath, 'utf-8');
  let settingsRaw: unknown;
  try {
    settingsRaw = YAML.parse(settingsContent);
  } catch (error) {
    throw new PromptLoadError(dirName, `Invalid YAML in settings.yaml: ${(error as Error).message}`);
  }

  const settingsResult = promptSettingsSchema.safeParse(settingsRaw);
  if (!settingsResult.success) {
    const issues = settingsResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new PromptLoadError(dirName, `Invalid settings.yaml: ${issues}`);
  }

  const settings = settingsResult.data;

  // Check the object file exists and includes the function
  try {
    await fs.access(settings.targetObjectPath);
  } catch {
    throw new PromptLoadError(dirName, `Target object file not found: ${settings.targetObjectPath}`);
  }

  // Use nm to check if the function exists in the object file
  try {
    const { stdout } = await execAsync(`nm "${settings.targetObjectPath}"`);
    const symbols = stdout.split('\n');
    const functionExists = symbols.some((line) => {
      // nm output format: [address] [type] [symbol_name]
      const parts = line.trim().split(/\s+/);
      const symbolName = parts[parts.length - 1];
      return symbolName === settings.functionName;
    });

    if (!functionExists) {
      throw new PromptLoadError(
        dirName,
        `Function '${settings.functionName}' not found in object file: ${settings.targetObjectPath}`,
      );
    }
  } catch (error) {
    if (error instanceof PromptLoadError) {
      throw error;
    }
    throw new PromptLoadError(dirName, `Failed to run nm on object file: ${(error as Error).message}`);
  }

  return {
    path: dirName,
    content,
    functionName: settings.functionName,
    targetObjectPath: settings.targetObjectPath,
    asm: settings.asm,
  };
}

/**
 * Load all prompts from a directory
 *
 * Scans promptsDir for directories and loads each as a prompt.
 * Each prompt directory must contain:
 *   - prompt.md: The prompt content
 *   - settings.yaml: Structured metadata
 */
export async function loadPrompts(promptsDir: string): Promise<{ prompts: PromptInfo[]; errors: PromptLoadError[] }> {
  const entries = await fs.readdir(promptsDir, { withFileTypes: true });
  const promptDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const prompts: PromptInfo[] = [];
  const errors: PromptLoadError[] = [];

  for (const dirName of promptDirs) {
    try {
      const prompt = await loadPromptFromDir(promptsDir, dirName);
      prompts.push(prompt);
    } catch (error) {
      if (error instanceof PromptLoadError) {
        errors.push(error);
      } else {
        errors.push(new PromptLoadError(dirName, (error as Error).message));
      }
    }
  }

  return { prompts, errors };
}
