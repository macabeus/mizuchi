/**
 * Prompt Loader
 *
 * Discovers and loads prompts from the prompts directory.
 * Each prompt lives in its own folder with:
 *   - prompt.md: The prompt content
 *   - settings.yaml: Structured metadata (functionName, targetObjectPath, etc.)
 */
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';

import { Objdiff } from '~/shared/objdiff.js';
import { promptSettingsSchema } from '~/shared/prompt-builder/prompt-settings.js';

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
  /** Assembly for the function */
  asm: string;
  /** Extra compiler flags from settings.yaml (optional) */
  compilerFlags?: string;
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
async function loadPromptFromDir(promptsDir: string, dirName: string, projectRoot?: string): Promise<PromptInfo> {
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

  // Resolve relative target object paths against the project root
  const targetObjectPath =
    projectRoot && !path.isAbsolute(settings.targetObjectPath)
      ? path.resolve(projectRoot, settings.targetObjectPath)
      : settings.targetObjectPath;

  // Check the object file exists and includes the function
  try {
    await fs.access(targetObjectPath);
  } catch {
    throw new PromptLoadError(dirName, `Target object file not found: ${targetObjectPath}`);
  }

  // Use objdiff-wasm to check if the function exists in the object file.
  // Format-agnostic: works on ELF, COFF (MSVC), etc.
  try {
    const objdiff = new Objdiff();
    const parsedObject = await objdiff.parseObjectFile(targetObjectPath, 'target');
    const symbolNames = await objdiff.getSymbolNames(parsedObject);

    if (!symbolNames.includes(settings.functionName)) {
      throw new PromptLoadError(
        dirName,
        `Function '${settings.functionName}' not found in object file: ${targetObjectPath}`,
      );
    }
  } catch (error) {
    if (error instanceof PromptLoadError) {
      throw error;
    }
    throw new PromptLoadError(dirName, `Failed to parse object file: ${(error as Error).message}`);
  }

  return {
    path: dirName,
    content,
    functionName: settings.functionName,
    targetObjectPath,
    asm: settings.asm,
    compilerFlags: settings.compilerFlags,
  };
}

/**
 * Load all prompts from a directory
 *
 * Scans promptsDir for directories and loads each as a prompt.
 * Each prompt directory must contain:
 *   - prompt.md: The prompt content
 *   - settings.yaml: Structured metadata
 *
 * Relative targetObjectPath values in settings.yaml are resolved against
 * projectRoot when provided.
 */
export async function loadPrompts(
  promptsDir: string,
  projectRoot?: string,
): Promise<{ prompts: PromptInfo[]; errors: PromptLoadError[] }> {
  const entries = await fs.readdir(promptsDir, { withFileTypes: true });
  const promptDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const prompts: PromptInfo[] = [];
  const errors: PromptLoadError[] = [];

  for (const dirName of promptDirs) {
    try {
      const prompt = await loadPromptFromDir(promptsDir, dirName, projectRoot);
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
