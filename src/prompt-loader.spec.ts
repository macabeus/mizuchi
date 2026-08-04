import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getArmCompilerScript } from '~/shared/c-compiler/__fixtures__/index.js';
import { CCompiler } from '~/shared/c-compiler/c-compiler.js';

import { loadPrompts } from './prompt-loader.js';

const coffFixturePath = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '__fixtures__',
  'test-function.obj',
);

describe('PromptLoaderPlugin', () => {
  let tempDir: string;
  const compiler = new CCompiler(getArmCompilerScript(), os.tmpdir());
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
    settings: { functionName: string; targetObjectPath: string; asm?: string; compilerFlags?: string },
  ): Promise<string> {
    const promptDir = path.join(tempDir, dirName);
    await fs.mkdir(promptDir);
    await fs.writeFile(path.join(promptDir, 'prompt.md'), promptContent);
    const asm = settings.asm ?? `.text\nglabel ${settings.functionName}\n    bx lr\n`;
    let yaml = `functionName: "${settings.functionName}"\ntargetObjectPath: "${settings.targetObjectPath}"\n`;
    if (settings.compilerFlags !== undefined) {
      yaml += `compilerFlags: "${settings.compilerFlags}"\n`;
    }
    yaml += `asm: |\n${asm
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n')}`;
    await fs.writeFile(path.join(promptDir, 'settings.yaml'), yaml);
    return promptDir;
  }

  async function compileFunction(functionName: string): Promise<string> {
    const cCode = `
void ${functionName}(void) {
    volatile int x = 1;
    x = x + 1;
}
`;
    const result = await compiler.compile(functionName, cCode, emptyContextPath);
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
      expect(result.prompts[0].asm).toContain('glabel TestFunction');
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

  describe('COFF objects (MSVC)', () => {
    // Pre-built i386 COFF object containing one external function symbol
    // named '?test_func@@YAXXZ' (see __fixtures__/README.md).
    const coffObjPath = coffFixturePath;

    it('finds MSVC-mangled symbols in COFF objects', async () => {
      await createPromptDir('coff-prompt', 'Decompile this function.', {
        functionName: '?test_func@@YAXXZ',
        targetObjectPath: coffObjPath,
      });

      const result = await loadPrompts(tempDir);

      expect(result.errors).toHaveLength(0);
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0].functionName).toBe('?test_func@@YAXXZ');
    });

    it('skips COFF prompts when the mangled name does not match', async () => {
      await createPromptDir('coff-wrong', 'Some content', {
        functionName: '?other_func@@YAXXZ',
        targetObjectPath: coffObjPath,
      });

      const result = await loadPrompts(tempDir);

      expect(result.prompts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Function '?other_func@@YAXXZ' not found in object file");
    });

    it('passes compilerFlags through from settings.yaml', async () => {
      await createPromptDir('coff-flags', 'Decompile this function.', {
        functionName: '?test_func@@YAXXZ',
        targetObjectPath: coffObjPath,
        compilerFlags: '/O1 /Gy',
      });

      const result = await loadPrompts(tempDir);

      expect(result.errors).toHaveLength(0);
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0].compilerFlags).toBe('/O1 /Gy');
    });

    it('resolves relative target object paths against the project root', async () => {
      // Copy the fixture into a fake project tree (kept outside tempDir so the
      // loader does not scan it as a prompt directory) and reference it relatively.
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-loader-project-'));
      try {
        await fs.mkdir(path.join(projectRoot, 'build'), { recursive: true });
        await fs.copyFile(coffObjPath, path.join(projectRoot, 'build', 'test-function.obj'));

        await createPromptDir('coff-relative', 'Decompile this function.', {
          functionName: '?test_func@@YAXXZ',
          targetObjectPath: 'build/test-function.obj',
        });

        const withoutRoot = await loadPrompts(tempDir);
        expect(withoutRoot.errors).toHaveLength(1);

        const withRoot = await loadPrompts(tempDir, projectRoot);
        expect(withRoot.errors).toHaveLength(0);
        expect(withRoot.prompts).toHaveLength(1);
        expect(withRoot.prompts[0].targetObjectPath).toBe(
          path.join(projectRoot, 'build', 'test-function.obj'),
        );
      } finally {
        await fs.rm(projectRoot, { recursive: true, force: true });
      }
    });
  });
});
