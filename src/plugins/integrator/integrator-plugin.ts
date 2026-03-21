/**
 * Integrator Plugin
 *
 * Post-match plugin that integrates decompiled C code into the decomp project.
 * Runs in a git worktree for safety — never modifies the main working tree.
 *
 * The user provides a JavaScript module (`integratorModule`) that
 * knows how to place generated C code into their specific project structure.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { z } from 'zod';

import type { PipelineConfig } from '~/shared/config.js';
import type {
  ChatMessage,
  PipelineContext,
  Plugin,
  PluginReportSection,
  PluginResult,
  PluginStatusData,
  QueryFactory,
} from '~/shared/types.js';

import { attemptBuildFix } from './build-fixer.js';
import { IntegratorHelpers, createIntegratorHelpers } from './integrator-helpers.js';

/**
 * Configuration schema for the Integrator plugin
 */
export const integratorConfigSchema = z.object({
  enable: z.boolean().default(false),

  /** Path to the JS module that performs integration (relative to project root) */
  integratorModule: z.string(),

  /** Shell script to verify the build after integration. Template var: {{worktreePath}} */
  verifyBuildScript: z.string().optional(),

  /**
   * Controls how far automation goes after a successful match:
   * - "commit" → commit only
   * - "push"   → commit + push
   * - "pr"     → commit + push + open PR
   */
  autoAction: z.enum(['commit', 'push', 'pr']).default('commit'),

  /** Commit message template. Template var: {{functionName}} */
  commitMessageTemplate: z.string().default('match {{functionName}}'),

  /** Branch name template. Template vars: {{functionName}}, {{timestamp}} */
  branchTemplate: z.string().default('mizuchi/{{functionName}}'),

  /** PR settings (required when autoAction is "pr") */
  pr: z
    .object({
      /** PR title template. Template var: {{functionName}} */
      title: z.string().default('Match {{functionName}}'),
      /** PR body template. Template var: {{functionName}} */
      body: z.string().default('Matched `{{functionName}}` via Mizuchi.'),
    })
    .optional(),

  /** AI-powered build fix settings */
  aiBuildFix: z
    .object({
      enable: z.boolean().default(false),
      timeoutMs: z.number().positive().default(300_000),
      model: z.string().optional(),
    })
    .default({ enable: false, timeoutMs: 300_000 }),
});

export type IntegratorConfig = z.infer<typeof integratorConfigSchema>;

/**
 * Result data from the Integrator plugin
 */
export interface IntegratorResult {
  /** Whether the integration + build succeeded */
  integrationSuccess: boolean;
  /** Whether the build verification passed */
  buildPassed: boolean;
  /** Path to the git worktree */
  worktreePath: string;
  /** Branch name in the worktree */
  branchName: string;
  /** Commit hash if auto-committed */
  commitHash?: string;
  /** Whether the branch was pushed to a remote */
  pushed?: boolean;
  /** URL of the opened pull request */
  prUrl?: string;
  /** Files modified during integration */
  filesModified: string[];
  /** Summary from the integration script */
  integrationSummary: string;
  /** Build verification output (stdout+stderr) */
  buildOutput?: string;
  /** AI build fix result, if attempted */
  aiBuildFix?: {
    attempted: boolean;
    fixed: boolean;
  };
}

/**
 * The shape of the user's integratorModule export
 */
interface IntegratorModuleExports {
  integrate(params: {
    functionName: string;
    generatedCode: string;
    worktreePath: string;
    projectRoot: string;
    helpers: IntegratorHelpers;
  }): Promise<{
    filesModified: string[];
    summary: string;
  }>;
}

export class IntegratorPlugin implements Plugin<IntegratorResult> {
  static readonly pluginId = 'integrator';

  readonly id = IntegratorPlugin.pluginId;
  readonly name = 'Integrator';
  readonly description = 'Integrates matched C code into the decomp project';

  #config: IntegratorConfig;
  #pipelineConfig: PipelineConfig;
  #queryFactory?: QueryFactory;
  #buildFixChatHistory: ChatMessage[] = [];
  #buildFixSystemPrompt?: string;
  #statusCallback?: (status: PluginStatusData) => void;

  constructor(config: IntegratorConfig, pipelineConfig: PipelineConfig, queryFactory?: QueryFactory) {
    this.#config = config;
    this.#pipelineConfig = pipelineConfig;
    this.#queryFactory = queryFactory;
  }

  setStatusCallback(callback: (status: PluginStatusData) => void): void {
    this.#statusCallback = callback;
  }

  #emitPhaseStatus(phase: string): void {
    this.#statusCallback?.({ logLines: [phase] });
  }

  async execute(context: PipelineContext): Promise<{
    result: PluginResult<IntegratorResult>;
    context: PipelineContext;
  }> {
    const startTime = Date.now();
    const projectRoot = this.#pipelineConfig.projectRoot;
    this.#buildFixChatHistory = [];
    this.#buildFixSystemPrompt = undefined;

    if (!context.generatedCode) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: 'No generated code available in pipeline context',
        },
        context,
      };
    }

    // Resolve branch name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const requestedBranch = this.#config.branchTemplate
      .replaceAll('{{functionName}}', context.functionName)
      .replaceAll('{{timestamp}}', timestamp);

    // Create git worktree (may append index if branch already exists)
    this.#emitPhaseStatus('Creating git worktree...');
    let worktreePath: string;
    let branchName: string;
    try {
      const wt = this.#createWorktree(projectRoot, requestedBranch);
      worktreePath = wt.worktreePath;
      branchName = wt.branchName;
    } catch (error) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: `Failed to create git worktree: ${error instanceof Error ? error.message : String(error)}`,
        },
        context,
      };
    }

    // Run the user's integratorModule
    this.#emitPhaseStatus('Running integration script...');
    const { helpers, getLogs } = createIntegratorHelpers(worktreePath);
    let filesModified: string[] = [];
    let integrationSummary = '';

    try {
      const modulePath = path.resolve(projectRoot, this.#config.integratorModule);
      const moduleUrl = pathToFileURL(modulePath).href;
      const userModule = (await import(moduleUrl)) as IntegratorModuleExports;

      if (typeof userModule.integrate !== 'function') {
        throw new Error(`integratorModule at ${this.#config.integratorModule} does not export an "integrate" function`);
      }

      const result = await userModule.integrate({
        functionName: context.functionName,
        generatedCode: context.generatedCode,
        worktreePath,
        projectRoot,
        helpers,
      });

      filesModified = result.filesModified;
      integrationSummary = result.summary;
    } catch (error) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: `Integration script failed: ${error instanceof Error ? error.message : String(error)}`,
          output: getLogs().join('\n'),
          data: {
            integrationSuccess: false,
            buildPassed: false,
            worktreePath,
            branchName,
            filesModified: [],
            integrationSummary: '',
          },
        },
        context,
      };
    }

    // Run build verification
    let buildPassed = true;
    let buildOutput = '';

    if (this.#config.verifyBuildScript) {
      this.#emitPhaseStatus('Verifying build...');
      try {
        buildOutput = this.#runVerifyBuild(worktreePath);
      } catch (error) {
        buildPassed = false;
        if (error instanceof Error && 'stderr' in error) {
          const stderr = (error as Record<string, unknown>).stderr;
          const stdout = (error as Record<string, unknown>).stdout;
          buildOutput = [
            stdout instanceof Buffer ? stdout.toString() : '',
            stderr instanceof Buffer ? stderr.toString() : '',
          ]
            .filter(Boolean)
            .join('\n');
        } else {
          buildOutput = error instanceof Error ? error.message : String(error);
        }
      }
    }

    if (!buildPassed) {
      // Attempt AI-powered build fix if enabled
      const aiBuildFixConfig = this.#config.aiBuildFix;
      if (aiBuildFixConfig?.enable && this.#config.verifyBuildScript) {
        this.#emitPhaseStatus('AI build fix: starting...');
        const verifyBuildCommand = this.#config.verifyBuildScript.replaceAll('{{worktreePath}}', worktreePath);
        const fixResult = await attemptBuildFix({
          worktreePath,
          buildError: buildOutput,
          filesModified,
          functionName: context.functionName,
          generatedCode: context.generatedCode,
          verifyBuildCommand,
          timeoutMs: aiBuildFixConfig.timeoutMs,
          model: aiBuildFixConfig.model,
          queryFactory: this.#queryFactory,
          statusCallback: this.#statusCallback,
        });

        this.#buildFixChatHistory = fixResult.chatHistory;
        this.#buildFixSystemPrompt = fixResult.systemPrompt;

        if (fixResult.fixed) {
          buildPassed = true;
          buildOutput = fixResult.buildOutput;
        } else {
          return {
            result: {
              pluginId: this.id,
              pluginName: this.name,
              status: 'failure',
              durationMs: Date.now() - startTime,
              error: 'Build verification failed after integration (AI fix attempted but unsuccessful)',
              output: [...getLogs(), '', '--- Build Output ---', fixResult.buildOutput].join('\n'),
              data: {
                integrationSuccess: true,
                buildPassed: false,
                worktreePath,
                branchName,
                filesModified,
                integrationSummary,
                buildOutput: fixResult.buildOutput,
                aiBuildFix: { attempted: true, fixed: false },
              },
            },
            context,
          };
        }
      } else {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: 'Build verification failed after integration',
            output: [...getLogs(), '', '--- Build Output ---', buildOutput].join('\n'),
            data: {
              integrationSuccess: true,
              buildPassed: false,
              worktreePath,
              branchName,
              filesModified,
              integrationSummary,
              buildOutput,
            },
          },
          context,
        };
      }
    }

    // Auto-action chain: commit → push → PR
    const autoAction = this.#config.autoAction;
    let commitHash: string | undefined;
    let pushed: boolean | undefined;
    let prUrl: string | undefined;

    const makeResultData = (): IntegratorResult => ({
      integrationSuccess: true,
      buildPassed: true,
      worktreePath,
      branchName,
      commitHash,
      pushed,
      prUrl,
      filesModified,
      integrationSummary,
      buildOutput,
      ...(this.#buildFixChatHistory.length > 0 ? { aiBuildFix: { attempted: true, fixed: true } } : {}),
    });

    // Step 1: Commit
    this.#emitPhaseStatus('Committing changes...');
    try {
      commitHash = this.#commitChanges(worktreePath, context.functionName);
    } catch (error) {
      return {
        result: {
          pluginId: this.id,
          pluginName: this.name,
          status: 'failure',
          durationMs: Date.now() - startTime,
          error: `Failed to commit: ${error instanceof Error ? error.message : String(error)}`,
          output: getLogs().join('\n'),
          data: makeResultData(),
        },
        context,
      };
    }

    // Step 2: Push (if autoAction is "push" or "pr")
    if (autoAction === 'push' || autoAction === 'pr') {
      this.#emitPhaseStatus('Pushing branch...');
      try {
        this.#pushBranch(worktreePath, branchName);
        pushed = true;
      } catch (error) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: `Failed to push: ${error instanceof Error ? error.message : String(error)}`,
            output: getLogs().join('\n'),
            data: makeResultData(),
          },
          context,
        };
      }
    }

    // Step 3: Open PR (if autoAction is "pr")
    if (autoAction === 'pr') {
      this.#emitPhaseStatus('Opening pull request...');
      try {
        prUrl = this.#openPullRequest(worktreePath, branchName, context.functionName);
      } catch (error) {
        return {
          result: {
            pluginId: this.id,
            pluginName: this.name,
            status: 'failure',
            durationMs: Date.now() - startTime,
            error: `Failed to open PR: ${error instanceof Error ? error.message : String(error)}`,
            output: getLogs().join('\n'),
            data: makeResultData(),
          },
          context,
        };
      }
    }

    return {
      result: {
        pluginId: this.id,
        pluginName: this.name,
        status: 'success',
        durationMs: Date.now() - startTime,
        output: getLogs().join('\n'),
        data: makeResultData(),
      },
      context,
    };
  }

  getReportSections(result: PluginResult<IntegratorResult>): PluginReportSection[] {
    const sections: PluginReportSection[] = [];
    const data = result.data;

    if (data) {
      const statusLines = [
        `Integration: ${data.integrationSuccess ? 'Success' : 'Failed'}`,
        `Build verification: ${data.buildPassed ? 'Passed' : 'Failed'}`,
        `Branch: ${data.branchName}`,
        `Worktree: ${data.worktreePath}`,
        ...(data.commitHash ? [`Commit: ${data.commitHash}`] : []),
        ...(data.pushed ? ['Pushed: Yes'] : []),
        ...(data.prUrl ? [`PR: ${data.prUrl}`] : []),
        ...(data.filesModified.length > 0 ? ['', 'Files modified:', ...data.filesModified.map((f) => `  ${f}`)] : []),
      ];

      sections.push({
        type: 'message',
        title: 'Integration Summary',
        message: statusLines.join('\n'),
      });

      if (data.integrationSummary) {
        sections.push({
          type: 'message',
          title: 'Integration Script Output',
          message: data.integrationSummary,
        });
      }

      if (data.buildOutput) {
        sections.push({
          type: 'code',
          title: 'Build Verification Output',
          language: 'text',
          code: data.buildOutput,
        });
      }
    }

    if (this.#buildFixChatHistory.length > 0) {
      sections.push({
        type: 'chat',
        title: 'AI Build Fix',
        messages: [
          ...(this.#buildFixSystemPrompt ? [{ role: 'system' as const, content: this.#buildFixSystemPrompt }] : []),
          ...this.#buildFixChatHistory,
        ],
      });
    }

    if (result.error) {
      sections.push({
        type: 'message',
        title: 'Error',
        message: result.error,
      });
    }

    return sections;
  }

  /**
   * Create a git worktree from the project repo.
   * If the branch already exists, appends an incrementing index (-1, -2, ...).
   * Returns { worktreePath, branchName } with the actual branch name used.
   */
  #createWorktree(projectRoot: string, branchName: string): { worktreePath: string; branchName: string } {
    const worktreeBase = path.join(os.tmpdir(), 'mizuchi-integrator');
    fs.mkdirSync(worktreeBase, { recursive: true });

    // Try the base name first, then append -1, -2, ... on conflict
    let actualBranch = branchName;
    for (let attempt = 0; attempt <= 100; attempt++) {
      if (attempt > 0) {
        actualBranch = `${branchName}-${attempt}`;
      }

      const worktreePath = path.join(worktreeBase, actualBranch.replace(/\//g, '-'));

      // Clean up stale worktree at this path
      if (fs.existsSync(worktreePath)) {
        try {
          execSync(`git worktree remove --force "${worktreePath}"`, {
            cwd: projectRoot,
            stdio: 'pipe',
          });
        } catch {
          fs.rmSync(worktreePath, { recursive: true, force: true });
          try {
            execSync('git worktree prune', { cwd: projectRoot, stdio: 'pipe' });
          } catch {
            // Best-effort prune
          }
        }
      }

      try {
        execSync(`git worktree add -b "${actualBranch}" "${worktreePath}" HEAD`, {
          cwd: projectRoot,
          stdio: 'pipe',
        });
        return { worktreePath, branchName: actualBranch };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // If branch already exists, try the next index
        if (msg.includes('already exists')) {
          continue;
        }
        throw error;
      }
    }

    throw new Error(`Failed to create worktree: branch name "${branchName}" and 100 alternatives are all taken`);
  }

  /**
   * Run the verifyBuildScript in the worktree
   */
  #runVerifyBuild(worktreePath: string): string {
    const script = this.#config.verifyBuildScript!.replaceAll('{{worktreePath}}', worktreePath);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuchi-verify-'));
    const scriptPath = path.join(tmpDir, 'verify-build.sh');
    fs.writeFileSync(scriptPath, 'set -e\n' + script);

    try {
      const result = execSync(`bash "${scriptPath}"`, {
        cwd: worktreePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300_000, // 5 minute timeout for builds
      });

      return result.toString();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Commit changes in the worktree
   */
  #commitChanges(worktreePath: string, functionName: string): string {
    const commitMessage = this.#config.commitMessageTemplate.replaceAll('{{functionName}}', functionName);

    execSync('git add -A', { cwd: worktreePath, stdio: 'pipe' });

    // Restore submodule gitlinks — setup.sh may have replaced submodule dirs
    // with symlinks, and `git add -A` stages them as symlinks which breaks
    // the submodule reference on CI. Reset them to HEAD's gitlinks.
    const gitmodulesPath = path.join(worktreePath, '.gitmodules');
    if (fs.existsSync(gitmodulesPath)) {
      const content = fs.readFileSync(gitmodulesPath, 'utf-8');
      const submodulePaths = [...content.matchAll(/^\s*path\s*=\s*(.+)$/gm)].map((m) => m[1].trim());
      for (const subPath of submodulePaths) {
        try {
          execSync(`git reset HEAD -- "${subPath}"`, { cwd: worktreePath, stdio: 'pipe' });
        } catch {
          // Best-effort — submodule may not exist in this commit
        }
      }
    }

    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
      cwd: worktreePath,
      stdio: 'pipe',
    });

    const hash = execSync('git rev-parse --short HEAD', {
      cwd: worktreePath,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim();

    return hash;
  }

  /**
   * Push the branch to the remote
   */
  #pushBranch(worktreePath: string, branchName: string): void {
    execSync(`git push -u origin "${branchName}"`, {
      cwd: worktreePath,
      stdio: 'pipe',
      timeout: 60_000,
    });
  }

  /**
   * Open a pull request via the `gh` CLI
   */
  #openPullRequest(worktreePath: string, branchName: string, functionName: string): string {
    const title = (this.#config.pr?.title ?? 'Match {{functionName}}').replaceAll('{{functionName}}', functionName);
    const body = (this.#config.pr?.body ?? 'Matched `{{functionName}}` via Mizuchi.').replaceAll(
      '{{functionName}}',
      functionName,
    );

    const result = execSync(
      `gh pr create --head "${branchName}" --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`,
      {
        cwd: worktreePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      },
    );

    return result.toString().trim();
  }
}
