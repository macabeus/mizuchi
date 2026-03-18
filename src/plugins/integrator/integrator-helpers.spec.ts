import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createIntegratorHelpers } from './integrator-helpers.js';

describe('IntegratorHelpers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuchi-integrator-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('findSourceFile', () => {
    it('finds file containing INCLUDE_ASM for function', () => {
      const filePath = path.join(tmpDir, 'src', 'math.c');
      fs.writeFileSync(
        filePath,
        [
          '#include "global.h"',
          'INCLUDE_ASM("asm/nonmatchings/math", FUN_08000960);',
          'INCLUDE_ASM("asm/nonmatchings/math", FUN_08000978);',
        ].join('\n'),
      );

      const { helpers } = createIntegratorHelpers(tmpDir);
      expect(helpers.findSourceFile('FUN_08000960')).toBe(filePath);
    });

    it('finds file containing #pragma GLOBAL_ASM for function', () => {
      const filePath = path.join(tmpDir, 'src', 'module.c');
      fs.writeFileSync(filePath, '#pragma GLOBAL_ASM("asm/jp/nonmatchings/code/m_demo/func_800CDB10_jp.s")\n');

      const { helpers } = createIntegratorHelpers(tmpDir);
      expect(helpers.findSourceFile('func_800CDB10_jp')).toBe(filePath);
    });

    it('throws when function is not found', () => {
      fs.writeFileSync(path.join(tmpDir, 'src', 'math.c'), 'int main() {}');

      const { helpers } = createIntegratorHelpers(tmpDir);
      expect(() => helpers.findSourceFile('nonexistent')).toThrow('Could not find source file');
    });

    it('searches subdirectories recursively', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'game', 'interactables'), { recursive: true });
      const filePath = path.join(tmpDir, 'src', 'game', 'interactables', 'spring.c');
      fs.writeFileSync(filePath, 'INCLUDE_ASM("asm/spring", MyFunc);');

      const { helpers } = createIntegratorHelpers(tmpDir);
      expect(helpers.findSourceFile('MyFunc')).toBe(filePath);
    });
  });

  describe('replaceIncludeAsm', () => {
    it('replaces INCLUDE_ASM stub with C code', () => {
      const filePath = path.join(tmpDir, 'src', 'math.c');
      fs.writeFileSync(
        filePath,
        [
          '#include "global.h"',
          'INCLUDE_ASM("asm/nonmatchings/math", FUN_08000960);',
          'INCLUDE_ASM("asm/nonmatchings/math", FUN_08000978);',
        ].join('\n') + '\n',
      );

      const { helpers } = createIntegratorHelpers(tmpDir);
      helpers.replaceIncludeAsm(filePath, 'FUN_08000960', 's16 FUN_08000960(s32 a) {\n    return a;\n}');

      const result = fs.readFileSync(filePath, 'utf-8');
      expect(result).toContain('s16 FUN_08000960(s32 a) {\n    return a;\n}');
      expect(result).not.toContain('INCLUDE_ASM("asm/nonmatchings/math", FUN_08000960)');
      // Other stubs should remain
      expect(result).toContain('INCLUDE_ASM("asm/nonmatchings/math", FUN_08000978)');
    });

    it('throws when stub is not found', () => {
      const filePath = path.join(tmpDir, 'src', 'math.c');
      fs.writeFileSync(filePath, 'int main() {}');

      const { helpers } = createIntegratorHelpers(tmpDir);
      expect(() => helpers.replaceIncludeAsm(filePath, 'FUN_08000960', 'code')).toThrow(
        'Could not find INCLUDE_ASM stub',
      );
    });
  });

  describe('replacePragmaGlobalAsm', () => {
    it('replaces #pragma GLOBAL_ASM with C code', () => {
      const filePath = path.join(tmpDir, 'src', 'module.c');
      fs.writeFileSync(
        filePath,
        [
          '#include "module.h"',
          '#pragma GLOBAL_ASM("asm/jp/nonmatchings/code/module/func_A.s")',
          '#pragma GLOBAL_ASM("asm/jp/nonmatchings/code/module/func_B.s")',
        ].join('\n') + '\n',
      );

      const { helpers } = createIntegratorHelpers(tmpDir);
      helpers.replacePragmaGlobalAsm(filePath, 'func_A', 'void func_A(void) {\n}');

      const result = fs.readFileSync(filePath, 'utf-8');
      expect(result).toContain('void func_A(void) {\n}');
      expect(result).not.toContain('func_A.s');
      expect(result).toContain('func_B.s');
    });
  });

  describe('log', () => {
    it('captures log messages', () => {
      const { helpers, getLogs } = createIntegratorHelpers(tmpDir);
      helpers.log('step 1');
      helpers.log('step 2');
      expect(getLogs()).toEqual(['step 1', 'step 2']);
    });
  });

  describe('stripDuplicateDeclarations', () => {
    it('strips declarations for functions already in the file', () => {
      const filePath = path.join(tmpDir, 'src', 'math.c');
      fs.writeFileSync(
        filePath,
        [
          '#include "global.h"',
          'extern s16 FUN_080518a4(s32 a, s16 b);',
          '',
          's16 FUN_08000960(s32 arg0, s16 arg1) {',
          '    return (s16)FUN_080518a4(arg0 << 8, arg1);',
          '}',
        ].join('\n'),
      );

      const { helpers } = createIntegratorHelpers(tmpDir);
      const code =
        's16 FUN_080518a4(s32, s16);\n\ns16 FUN_08000978(s16 arg0) {\n    return FUN_080518a4(0x10000, arg0);\n}';
      const result = helpers.stripDuplicateDeclarations(filePath, code);

      expect(result).not.toContain('FUN_080518a4(s32, s16);');
      expect(result).toContain('FUN_08000978');
    });

    it('strips extern declarations too', () => {
      const filePath = path.join(tmpDir, 'src', 'math.c');
      fs.writeFileSync(filePath, 's16 FUN_080518a4(s32 a, s16 b);\n');

      const { helpers } = createIntegratorHelpers(tmpDir);
      const code = 'extern s16 FUN_080518a4(s32 a, s16 b);\n\nvoid foo(void) {}';
      const result = helpers.stripDuplicateDeclarations(filePath, code);

      expect(result).not.toContain('extern');
      expect(result).toContain('void foo(void) {}');
    });

    it('keeps declarations for functions not in the file', () => {
      const filePath = path.join(tmpDir, 'src', 'math.c');
      fs.writeFileSync(filePath, '#include "global.h"\n');

      const { helpers } = createIntegratorHelpers(tmpDir);
      const code = 'extern s16 FUN_080518a4(s32 a, s16 b);\n\nvoid foo(void) {}';
      const result = helpers.stripDuplicateDeclarations(filePath, code);

      expect(result).toContain('extern s16 FUN_080518a4');
      expect(result).toContain('void foo(void) {}');
    });
  });

  describe('exec', () => {
    it('runs shell commands in worktree directory', () => {
      const { helpers } = createIntegratorHelpers(tmpDir);
      const output = helpers.exec('pwd');
      // macOS /var → /private/var symlink: use fs.realpathSync for comparison
      expect(fs.realpathSync(output.trim())).toBe(fs.realpathSync(tmpDir));
    });

    it('throws on non-zero exit code', () => {
      const { helpers } = createIntegratorHelpers(tmpDir);
      expect(() => helpers.exec('exit 1')).toThrow();
    });
  });
});
