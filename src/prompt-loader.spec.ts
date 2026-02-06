import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CCompiler } from '~/shared/c-compiler/c-compiler.js';

import { loadPrompts } from './prompt-loader.js';

describe('PromptLoaderPlugin', () => {
  let tempDir: string;
  const compiler = new CCompiler();
  const emptyContextPath = '';
  const compiledObjects: string[] = [];

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-loader-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    // Clean up compiled object files
    for (const objPath of compiledObjects) {
      await fs.unlink(objPath).catch(() => {});
    }
    compiledObjects.length = 0;
  });

  async function createPromptDir(
    dirName: string,
    promptContent: string,
    settings: { functionName: string; targetObjectPath: string },
  ): Promise<string> {
    const promptDir = path.join(tempDir, dirName);
    await fs.mkdir(promptDir);
    await fs.writeFile(path.join(promptDir, 'prompt.md'), promptContent);
    await fs.writeFile(
      path.join(promptDir, 'settings.yaml'),
      `functionName: "${settings.functionName}"\ntargetObjectPath: "${settings.targetObjectPath}"`,
    );
    return promptDir;
  }

  async function compileFunction(functionName: string): Promise<string> {
    const cCode = `
void ${functionName}(void) {
    volatile int x = 1;
    x = x + 1;
}
`;
    const defaultFlags = '-mthumb-interwork -Wimplicit -Wparentheses -Werror -O2 -fhex-asm';
    const result = await compiler.compile(functionName, cCode, emptyContextPath, defaultFlags);
    if (!result.success) {
      throw new Error(`Failed to compile ${functionName}`);
    }
    compiledObjects.push(result.objPath);
    return result.objPath;
  }

  describe('loadPrompts', () => {
    it('loads a prompt from a directory with prompt.md and settings.yaml', async () => {
      const objPath = await compileFunction('TestFunction');
      await createPromptDir('my-prompt', 'Decompile this function.', {
        functionName: 'TestFunction',
        targetObjectPath: objPath,
      });

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.prompts[0].path).toBe('my-prompt');
      expect(result.prompts[0].content).toBe('Decompile this function.');
      expect(result.prompts[0].functionName).toBe('TestFunction');
      expect(result.prompts[0].targetObjectPath).toBe(objPath);
    });

    it('loads multiple prompt directories', async () => {
      const objPath1 = await compileFunction('FuncOne');
      const objPath2 = await compileFunction('FuncTwo');
      const objPath3 = await compileFunction('FuncThree');

      await createPromptDir('prompt-one', 'First prompt', {
        functionName: 'FuncOne',
        targetObjectPath: objPath1,
      });
      await createPromptDir('prompt-two', 'Second prompt', {
        functionName: 'FuncTwo',
        targetObjectPath: objPath2,
      });
      await createPromptDir('prompt-three', 'Third prompt', {
        functionName: 'FuncThree',
        targetObjectPath: objPath3,
      });

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      const functionNames = result.prompts.map((p) => p.functionName);
      expect(functionNames).toContain('FuncOne');
      expect(functionNames).toContain('FuncTwo');
      expect(functionNames).toContain('FuncThree');
    });

    it('returns empty array for empty directory', async () => {
      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('skips directories without prompt.md', async () => {
      const promptDir = path.join(tempDir, 'missing-prompt-md');
      await fs.mkdir(promptDir);
      await fs.writeFile(
        path.join(promptDir, 'settings.yaml'),
        'functionName: "TestFunc"\ntargetObjectPath: "/test.o"',
      );

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Missing prompt.md');
    });

    it('skips directories without settings.yaml', async () => {
      const promptDir = path.join(tempDir, 'missing-settings');
      await fs.mkdir(promptDir);
      await fs.writeFile(path.join(promptDir, 'prompt.md'), 'Some content');

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Missing settings.yaml');
    });

    it('skips directories with invalid settings.yaml schema', async () => {
      const promptDir = path.join(tempDir, 'invalid-settings');
      await fs.mkdir(promptDir);
      await fs.writeFile(path.join(promptDir, 'prompt.md'), 'Some content');
      await fs.writeFile(path.join(promptDir, 'settings.yaml'), 'functionName: 123'); // missing targetObjectPath, wrong type

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Invalid settings.yaml');
    });

    it('skips directories with malformed YAML', async () => {
      const promptDir = path.join(tempDir, 'malformed-yaml');
      await fs.mkdir(promptDir);
      await fs.writeFile(path.join(promptDir, 'prompt.md'), 'Some content');
      await fs.writeFile(path.join(promptDir, 'settings.yaml'), ':: invalid yaml ::');

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Invalid YAML');
    });

    it('ignores files (only processes directories)', async () => {
      const objPath = await compileFunction('ValidFunc');
      await fs.writeFile(path.join(tempDir, 'random-file.md'), 'Not a prompt');
      await createPromptDir('valid-prompt', 'Valid content', {
        functionName: 'ValidFunc',
        targetObjectPath: objPath,
      });

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.prompts[0].functionName).toBe('ValidFunc');
    });

    it('skips directories when target object file does not exist', async () => {
      await createPromptDir('missing-object', 'Some content', {
        functionName: 'TestFunc',
        targetObjectPath: '/nonexistent/file.o',
      });

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Target object file not found');
    });

    it('skips directories when function is not found in object file', async () => {
      const objPath = await compileFunction('PromptLoaderActualFunc');
      await createPromptDir('wrong-function', 'Some content', {
        functionName: 'WrongFunc',
        targetObjectPath: objPath,
      });

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Function 'WrongFunc' not found in object file");
    });
  });
});
