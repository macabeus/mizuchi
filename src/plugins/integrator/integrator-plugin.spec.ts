import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import assert from 'assert';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestContext, defaultTestPipelineConfig } from '~/shared/test-utils.js';
import type { QueryFactory } from '~/shared/types.js';

import type { IntegratorConfig } from './integrator-plugin.js';
import { IntegratorPlugin } from './integrator-plugin.js';

describe('IntegratorPlugin', () => {
  let projectRoot: string;
  let moduleDir: string;

  beforeEach(() => {
    // Create a temporary git repo to serve as the "decomp project"
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuchi-integrator-project-'));
    execSync('git init', { cwd: projectRoot, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: projectRoot, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: projectRoot, stdio: 'pipe' });

    // Create src/math.c with an INCLUDE_ASM stub
    fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'src', 'math.c'),
      [
        '#include "global.h"',
        'INCLUDE_ASM("asm/nonmatchings/math", FUN_08000960);',
        'INCLUDE_ASM("asm/nonmatchings/math", FUN_08000978);',
      ].join('\n') + '\n',
    );

    // Initial commit so worktree creation works
    execSync('git add -A', { cwd: projectRoot, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: projectRoot, stdio: 'pipe' });

    // Create a temp directory for the integrator module
    moduleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuchi-integrator-module-'));
  });

  afterEach(() => {
    // Clean up worktrees
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).toString();
      const worktrees = output
        .split('\n')
        .filter((l) => l.startsWith('worktree '))
        .map((l) => l.replace('worktree ', ''));
      for (const wt of worktrees) {
        if (wt !== projectRoot) {
          try {
            execSync(`git worktree remove --force "${wt}"`, { cwd: projectRoot, stdio: 'pipe' });
          } catch {
            // Best effort
          }
        }
      }
    } catch {
      // Best effort
    }
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(moduleDir, { recursive: true, force: true });
  });

  function createMockQueryFactory(messages: SDKMessage[]): QueryFactory {
    return vi.fn((_prompt: string, _options: { model?: string }) => {
      async function* generateMessages(): AsyncGenerator<SDKMessage> {
        yield { type: 'system', subtype: 'init', session_id: 'test-session' } as SDKMessage;
        for (const msg of messages) {
          yield msg;
        }
        yield { type: 'result', subtype: 'success', session_id: 'test-session' } as SDKMessage;
      }
      const gen = generateMessages();
      return Object.assign(gen, { close: vi.fn() });
    }) as unknown as QueryFactory;
  }

  function createPlugin(
    configOverrides: Partial<IntegratorConfig> = {},
    queryFactory?: QueryFactory,
  ): IntegratorPlugin {
    const config: IntegratorConfig = {
      enable: true,
      integratorModule: path.join(moduleDir, 'integrator.mjs'),
      verifyBuildScript: undefined,
      autoAction: 'commit',
      commitMessageTemplate: 'match {{functionName}}',
      branchTemplate: 'mizuchi/{{functionName}}',
      aiBuildFix: { enable: false, timeoutMs: 300_000 },
      ...configOverrides,
    };

    const pipelineConfig = {
      ...defaultTestPipelineConfig,
      projectRoot,
    };

    return new IntegratorPlugin(config, pipelineConfig, queryFactory);
  }

  it('fails when no generated code is available', async () => {
    const plugin = createPlugin();
    const context = createTestContext({
      config: { ...defaultTestPipelineConfig, projectRoot },
      generatedCode: undefined,
    });

    const { result } = await plugin.execute(context);
    expect(result.status).toBe('failure');
    expect(result.error).toContain('No generated code');
  });

  it('successfully integrates code using INCLUDE_ASM replacement', async () => {
    // Write the integrator module
    fs.writeFileSync(
      path.join(moduleDir, 'integrator.mjs'),
      `export async function integrate({ functionName, generatedCode, worktreePath, helpers }) {
        const srcFile = helpers.findSourceFile(functionName);
        helpers.replaceIncludeAsm(srcFile, functionName, generatedCode);
        return {
          filesModified: [srcFile],
          summary: 'Replaced stub for ' + functionName,
        };
      }`,
    );

    const plugin = createPlugin();
    const context = createTestContext({
      config: { ...defaultTestPipelineConfig, projectRoot },
      functionName: 'FUN_08000960',
      generatedCode: 's16 FUN_08000960(s32 a) {\n    return a;\n}',
    });

    const { result } = await plugin.execute(context);

    expect(result.status).toBe('success');
    expect(result.data?.integrationSuccess).toBe(true);
    expect(result.data?.buildPassed).toBe(true);
    expect(result.data?.commitHash).toBeTruthy();
    expect(result.data?.pushed).toBeUndefined();
    expect(result.data?.prUrl).toBeUndefined();
    expect(result.data?.filesModified.length).toBe(1);
    expect(result.data?.worktreePath).toBeTruthy();

    // Verify the file was actually modified in the worktree
    const worktreeMath = path.join(result.data!.worktreePath, 'src', 'math.c');
    const content = fs.readFileSync(worktreeMath, 'utf-8');
    expect(content).toContain('s16 FUN_08000960(s32 a)');
    expect(content).not.toContain('INCLUDE_ASM("asm/nonmatchings/math", FUN_08000960)');
    // Other stubs remain untouched
    expect(content).toContain('INCLUDE_ASM("asm/nonmatchings/math", FUN_08000978)');
  });

  it('auto-commits with autoAction commit', async () => {
    fs.writeFileSync(
      path.join(moduleDir, 'integrator.mjs'),
      `export async function integrate({ functionName, generatedCode, worktreePath, helpers }) {
        const srcFile = helpers.findSourceFile(functionName);
        helpers.replaceIncludeAsm(srcFile, functionName, generatedCode);
        return { filesModified: [srcFile], summary: 'done' };
      }`,
    );

    const plugin = createPlugin({ autoAction: 'commit' });
    const context = createTestContext({
      config: { ...defaultTestPipelineConfig, projectRoot },
      functionName: 'FUN_08000960',
      generatedCode: 's16 FUN_08000960(s32 a) { return a; }',
    });

    const { result } = await plugin.execute(context);

    expect(result.status).toBe('success');
    expect(result.data?.commitHash).toBeTruthy();

    // Verify the commit exists in the worktree
    const log = execSync('git log --oneline -1', {
      cwd: result.data!.worktreePath,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    expect(log).toContain('match FUN_08000960');
  });

  it('fails when build verification fails', async () => {
    fs.writeFileSync(
      path.join(moduleDir, 'integrator.mjs'),
      `export async function integrate({ functionName, generatedCode, worktreePath, helpers }) {
        const srcFile = helpers.findSourceFile(functionName);
        helpers.replaceIncludeAsm(srcFile, functionName, generatedCode);
        return { filesModified: [srcFile], summary: 'done' };
      }`,
    );

    const plugin = createPlugin({
      verifyBuildScript: 'echo "Build failed" && exit 1',
    });
    const context = createTestContext({
      config: { ...defaultTestPipelineConfig, projectRoot },
      functionName: 'FUN_08000960',
      generatedCode: 's16 FUN_08000960(s32 a) { return a; }',
    });

    const { result } = await plugin.execute(context);

    expect(result.status).toBe('failure');
    expect(result.error).toContain('Build verification failed');
    expect(result.data?.integrationSuccess).toBe(true);
    expect(result.data?.buildPassed).toBe(false);
    // Worktree should still exist for debugging
    expect(fs.existsSync(result.data!.worktreePath)).toBe(true);
  });

  it('fails when integratorModule does not export integrate', async () => {
    fs.writeFileSync(path.join(moduleDir, 'integrator.mjs'), 'export const foo = 42;');

    const plugin = createPlugin();
    const context = createTestContext({
      config: { ...defaultTestPipelineConfig, projectRoot },
      functionName: 'FUN_08000960',
      generatedCode: 'int x;',
    });

    const { result } = await plugin.execute(context);

    expect(result.status).toBe('failure');
    expect(result.error).toContain('does not export an "integrate" function');
  });

  it('generates report sections', () => {
    const plugin = createPlugin();

    const sections = plugin.getReportSections({
      pluginId: 'integrator',
      pluginName: 'Integrator',
      status: 'success',
      durationMs: 1000,
      data: {
        integrationSuccess: true,
        buildPassed: true,
        worktreePath: '/tmp/worktree',
        branchName: 'mizuchi/FUN_08000960',
        commitHash: 'abc1234',
        filesModified: ['src/math.c'],
        integrationSummary: 'Replaced stub',
        buildOutput: 'Build OK',
      },
    });

    expect(sections.length).toBeGreaterThanOrEqual(2);
    const summary = sections.find((s) => s.title === 'Integration Summary');
    assert(summary?.type === 'message');
    expect(summary.message).toContain('abc1234');
    expect(summary.message).toContain('src/math.c');
  });

  describe('AI build fix', () => {
    function writeIntegratorModule(): void {
      fs.writeFileSync(
        path.join(moduleDir, 'integrator.mjs'),
        `export async function integrate({ functionName, generatedCode, worktreePath, helpers }) {
          const srcFile = helpers.findSourceFile(functionName);
          helpers.replaceIncludeAsm(srcFile, functionName, generatedCode);
          return { filesModified: [srcFile], summary: 'done' };
        }`,
      );
    }

    it('does not attempt AI fix when aiBuildFix.enable is false (default)', async () => {
      writeIntegratorModule();

      const plugin = createPlugin({
        verifyBuildScript: 'echo "Build failed" && exit 1',
        aiBuildFix: { enable: false, timeoutMs: 300_000 },
      });
      const context = createTestContext({
        config: { ...defaultTestPipelineConfig, projectRoot },
        functionName: 'FUN_08000960',
        generatedCode: 's16 FUN_08000960(s32 a) { return a; }',
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toBe('Build verification failed after integration');
      expect(result.data?.aiBuildFix).toBeUndefined();
    });

    it('attempts AI fix and continues to commit when fix succeeds', async () => {
      writeIntegratorModule();

      const mockFactory = createMockQueryFactory([
        {
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [{ type: 'text', text: 'Fixed the build error.' }],
          },
        } as SDKMessage,
      ]);

      // Build script that fails on first run but succeeds on subsequent runs.
      // The plugin's initial build check fails, triggering the AI fix.
      // The build-fixer's final verification then succeeds.
      const counterFile = path.join(moduleDir, 'build-counter');
      fs.writeFileSync(counterFile, '0');
      const buildScript = `
COUNT=$(cat "${counterFile}")
NEW_COUNT=$((COUNT + 1))
echo $NEW_COUNT > "${counterFile}"
if [ "$COUNT" -eq "0" ]; then
  echo "Build failed" >&2
  exit 1
fi
echo "Build OK"
`;

      const plugin = createPlugin(
        {
          verifyBuildScript: buildScript,
          aiBuildFix: { enable: true, timeoutMs: 30_000 },
        },
        mockFactory,
      );

      const context = createTestContext({
        config: { ...defaultTestPipelineConfig, projectRoot },
        functionName: 'FUN_08000960',
        generatedCode: 's16 FUN_08000960(s32 a) { return a; }',
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('success');
      expect(result.data?.aiBuildFix).toEqual({ attempted: true, fixed: true });
      expect(result.data?.commitHash).toBeTruthy();
    });

    it('returns failure with aiBuildFix data when fix fails', async () => {
      writeIntegratorModule();

      const mockFactory = createMockQueryFactory([
        {
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [{ type: 'text', text: 'Attempting to fix...' }],
          },
        } as SDKMessage,
      ]);

      const plugin = createPlugin(
        {
          verifyBuildScript: 'echo "Build failed" && exit 1',
          aiBuildFix: { enable: true, timeoutMs: 30_000 },
        },
        mockFactory,
      );

      const context = createTestContext({
        config: { ...defaultTestPipelineConfig, projectRoot },
        functionName: 'FUN_08000960',
        generatedCode: 's16 FUN_08000960(s32 a) { return a; }',
      });

      const { result } = await plugin.execute(context);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('AI fix attempted but unsuccessful');
      expect(result.data?.aiBuildFix).toEqual({ attempted: true, fixed: false });
    });

    it('includes chat section in report when AI fix was attempted', async () => {
      writeIntegratorModule();

      const mockFactory = createMockQueryFactory([
        {
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [{ type: 'text', text: 'Attempting to fix...' }],
          },
        } as SDKMessage,
      ]);

      const plugin = createPlugin(
        {
          verifyBuildScript: 'echo "Build failed" && exit 1',
          aiBuildFix: { enable: true, timeoutMs: 30_000 },
        },
        mockFactory,
      );

      const context = createTestContext({
        config: { ...defaultTestPipelineConfig, projectRoot },
        functionName: 'FUN_08000960',
        generatedCode: 's16 FUN_08000960(s32 a) { return a; }',
      });

      const { result } = await plugin.execute(context);

      const sections = plugin.getReportSections(result);
      const chatSection = sections.find((s) => s.title === 'AI Build Fix');
      assert(chatSection?.type === 'chat');
      // System prompt + user prompt + assistant response
      expect(chatSection.messages.length).toBe(3);
      expect(chatSection.messages[0].role).toBe('system');
      expect(chatSection.messages[0].content).toContain('FUN_08000960');
      expect(chatSection.messages[1].role).toBe('user');
      expect(chatSection.messages[2].role).toBe('assistant');
    });
  });
});
