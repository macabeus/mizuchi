import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToolkitInitError, customizeDtkTemplateProject, parseToolkitInitRequest } from './toolkit-init.js';

describe('toolkit-init', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-toolkit-init-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('parseToolkitInitRequest', () => {
    it('returns null when toolkit init options are not used', () => {
      expect(parseToolkitInitRequest({})).toBeNull();
    });

    it('normalizes the game ID and provides defaults', () => {
      const request = parseToolkitInitRequest({
        initToolkit: 'dtk',
        gameId: 'glze01',
      });

      expect(request).toEqual({
        toolkit: 'dtk',
        gameId: 'GLZE01',
        projectDir: './glze01-dtk',
        platform: 'gc',
      });
    });

    it('throws when extra toolkit options are provided without --init-toolkit', () => {
      expect(() =>
        parseToolkitInitRequest({
          gameId: 'GLZE01',
        }),
      ).toThrow(ToolkitInitError);
    });

    it('throws on invalid game IDs', () => {
      expect(() =>
        parseToolkitInitRequest({
          initToolkit: 'dtk',
          gameId: 'bad-id!',
        }),
      ).toThrow("Invalid game ID 'bad-id!'");
    });
  });

  describe('customizeDtkTemplateProject', () => {
    it('renames GAMEID directories and rewrites key template files', async () => {
      const projectDir = path.join(tempDir, 'project');
      const gameId = 'GLZE01';

      await fs.mkdir(path.join(projectDir, 'orig', 'GAMEID'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'config', 'GAMEID'), { recursive: true });

      await fs.writeFile(path.join(projectDir, 'configure.py'), 'VERSIONS = ["GAMEID"]\n');
      await fs.writeFile(path.join(projectDir, 'config', 'GAMEID', 'config.yml'), 'object_base: orig/GAMEID\n');
      await fs.writeFile(
        path.join(projectDir, 'config', 'GAMEID', 'config.example.yml'),
        'symbols: config/GAMEID/symbols.txt\n',
      );
      await fs.writeFile(path.join(projectDir, 'config', 'GAMEID', 'build.sha1'), '0123  build/GAMEID/main.dol\n');

      await customizeDtkTemplateProject(projectDir, gameId);

      await expect(fs.stat(path.join(projectDir, 'orig', gameId))).resolves.toBeDefined();
      await expect(fs.stat(path.join(projectDir, 'config', gameId))).resolves.toBeDefined();
      await expect(fs.access(path.join(projectDir, 'orig', 'GAMEID'))).rejects.toBeTruthy();
      await expect(fs.access(path.join(projectDir, 'config', 'GAMEID'))).rejects.toBeTruthy();

      const configurePy = await fs.readFile(path.join(projectDir, 'configure.py'), 'utf-8');
      const configYml = await fs.readFile(path.join(projectDir, 'config', gameId, 'config.yml'), 'utf-8');
      const configExample = await fs.readFile(path.join(projectDir, 'config', gameId, 'config.example.yml'), 'utf-8');
      const buildSha = await fs.readFile(path.join(projectDir, 'config', gameId, 'build.sha1'), 'utf-8');

      expect(configurePy).toContain(gameId);
      expect(configurePy).not.toContain('GAMEID');
      expect(configYml).toContain(`orig/${gameId}`);
      expect(configYml).not.toContain('GAMEID');
      expect(configExample).toContain(`config/${gameId}/symbols.txt`);
      expect(buildSha).toContain(`build/${gameId}/main.dol`);
    });
  });
});
