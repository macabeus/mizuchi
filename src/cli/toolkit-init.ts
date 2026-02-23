import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DTK_TEMPLATE_REPO_URL = 'https://github.com/encounter/dtk-template.git';

export type SupportedToolkit = 'dtk';
export type DtkPlatform = 'gc' | 'wii';

export interface ToolkitInitCliOptions {
  initToolkit?: SupportedToolkit;
  projectDir?: string;
  gameId?: string;
  platform?: DtkPlatform;
}

interface DtkInitRequest {
  toolkit: 'dtk';
  projectDir: string;
  gameId: string;
  platform: DtkPlatform;
}

export interface ToolkitInitSummary {
  toolkit: 'dtk';
  templateRepo: string;
  projectDir: string;
  gameId: string;
  platform: DtkPlatform;
  nextSteps: string[];
}

export class ToolkitInitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolkitInitError';
  }
}

export function parseToolkitInitRequest(opts: ToolkitInitCliOptions): DtkInitRequest | null {
  const hasToolkitArgs = !!(opts.initToolkit || opts.projectDir || opts.gameId || opts.platform);
  if (!hasToolkitArgs) {
    return null;
  }

  if (!opts.initToolkit) {
    throw new ToolkitInitError('Toolkit init options (--project-dir/--game-id/--platform) require --init-toolkit dtk.');
  }

  if (opts.initToolkit !== 'dtk') {
    throw new ToolkitInitError(`Unsupported toolkit: ${opts.initToolkit}`);
  }

  if (!opts.gameId) {
    throw new ToolkitInitError('Missing required option for dtk scaffolding: --game-id (example: GLZE01).');
  }

  const gameId = opts.gameId.trim().toUpperCase();
  if (!/^[A-Z0-9_]{4,16}$/.test(gameId)) {
    throw new ToolkitInitError(`Invalid game ID '${opts.gameId}'. Expected 4-16 characters matching [A-Z0-9_].`);
  }

  const projectDir = opts.projectDir?.trim() || `./${gameId.toLowerCase()}-dtk`;
  const platform = opts.platform ?? 'gc';

  return {
    toolkit: 'dtk',
    projectDir,
    gameId,
    platform,
  };
}

export async function maybeRunToolkitInit(
  opts: ToolkitInitCliOptions,
  onStatus?: (message: string) => void,
): Promise<ToolkitInitSummary | null> {
  const request = parseToolkitInitRequest(opts);
  if (!request) {
    return null;
  }

  if (request.toolkit !== 'dtk') {
    throw new ToolkitInitError(`Unsupported toolkit: ${request.toolkit}`);
  }

  onStatus?.(
    `Scaffolding decomp-toolkit project (${request.platform.toUpperCase()}) at ${path.resolve(request.projectDir)}...`,
  );
  return scaffoldDtkProject(request);
}

async function scaffoldDtkProject(request: DtkInitRequest): Promise<ToolkitInitSummary> {
  const projectDir = path.resolve(request.projectDir);
  await ensureDestinationDoesNotExist(projectDir);
  await fs.mkdir(path.dirname(projectDir), { recursive: true });

  await runCommand('git', ['clone', '--depth', '1', DTK_TEMPLATE_REPO_URL, projectDir], process.cwd());

  try {
    await fs.rm(path.join(projectDir, '.git'), { recursive: true, force: true });
    await customizeDtkTemplateProject(projectDir, request.gameId);
    await initializeGitRepo(projectDir);
  } catch (error) {
    throw new ToolkitInitError(
      `decomp-toolkit scaffold created at ${projectDir}, but customization failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return {
    toolkit: 'dtk',
    templateRepo: DTK_TEMPLATE_REPO_URL,
    projectDir,
    gameId: request.gameId,
    platform: request.platform,
    nextSteps: buildDtkNextSteps(projectDir, request.gameId, request.platform),
  };
}

async function ensureDestinationDoesNotExist(projectDir: string): Promise<void> {
  try {
    await fs.access(projectDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  throw new ToolkitInitError(`Destination already exists: ${projectDir}`);
}

async function initializeGitRepo(projectDir: string): Promise<void> {
  try {
    await runCommand('git', ['init', '-b', 'main'], projectDir);
  } catch {
    await runCommand('git', ['init'], projectDir);
  }
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  try {
    await execFileAsync(command, args, { cwd });
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { stderr?: string };
    const details = execError.stderr?.trim() || execError.message;
    throw new ToolkitInitError(`Failed to run '${command} ${args.join(' ')}': ${details}`);
  }
}

export async function customizeDtkTemplateProject(projectDir: string, gameId: string): Promise<void> {
  const originalGameId = 'GAMEID';
  const origSource = path.join(projectDir, 'orig', originalGameId);
  const origDest = path.join(projectDir, 'orig', gameId);
  const configSource = path.join(projectDir, 'config', originalGameId);
  const configDest = path.join(projectDir, 'config', gameId);

  await fs.rename(origSource, origDest);
  await fs.rename(configSource, configDest);

  const filesToRewrite = [
    path.join(projectDir, 'configure.py'),
    path.join(configDest, 'config.yml'),
    path.join(configDest, 'config.example.yml'),
    path.join(configDest, 'build.sha1'),
  ];

  await Promise.all(filesToRewrite.map((filePath) => replaceInFile(filePath, originalGameId, gameId)));
}

async function replaceInFile(filePath: string, searchValue: string, replacementValue: string): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8');
  if (!content.includes(searchValue)) {
    return;
  }
  await fs.writeFile(filePath, content.replaceAll(searchValue, replacementValue));
}

function buildDtkNextSteps(projectDir: string, gameId: string, platform: DtkPlatform): string[] {
  const relativeProjectDir = path.relative(process.cwd(), projectDir);
  const displayProjectDir =
    !relativeProjectDir || relativeProjectDir.startsWith('..') ? projectDir : relativeProjectDir;

  return [
    `Extract the game disc contents into orig/${gameId} (Dolphin can extract GC/Wii discs).`,
    `Edit config/${gameId}/config.yml to match your game and linker settings (mw_comment_version, modules, maps).`,
    `Generate hashes with: dtk shasum orig/${gameId}/sys/main.dol orig/${gameId}/files/*.rel -o config/${gameId}/build.sha1`,
    `Run initial analysis: cd ${displayProjectDir} && python3 configure.py && ninja`,
    `When you create mizuchi.yaml for this project, set global.target to '${platform}'.`,
  ];
}
