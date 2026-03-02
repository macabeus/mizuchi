import { describe, expect, it } from 'vitest';

import {
  countBodyLinesFromAsmFunction,
  extractAsmFunctionBody,
  extractFunctionCallsFromAssembly,
  listFunctionsFromAsmModule,
  stripCommentaries,
} from './asm-utils';

describe('extractFunctionCallsFromAssembly', () => {
  describe('ARM', () => {
    it('extracts bl calls', () => {
      const asm = 'push {lr}\nbl sub_08001234\npop {r0}\nbx r0';
      const calls = extractFunctionCallsFromAssembly('gba', asm);
      expect(calls).toContain('sub_08001234');
    });

    it('extracts @ comment references', () => {
      const asm = 'ldr r0, [pc]\n@ =gSomeGlobal';
      const calls = extractFunctionCallsFromAssembly('gba', asm);
      expect(calls).toContain('gSomeGlobal');
    });

    it('extracts direct references in ldr/add/mov', () => {
      const asm = 'ldr r0, =MyFunc';
      const calls = extractFunctionCallsFromAssembly('gba', asm);
      expect(calls).toContain('MyFunc');
    });

    it('deduplicates calls', () => {
      const asm = 'bl foo\nbl foo\nbl foo';
      const calls = extractFunctionCallsFromAssembly('gba', asm);
      expect(calls.filter((c) => c === 'foo')).toHaveLength(1);
    });
  });

  describe('MIPS', () => {
    it('extracts jal calls', () => {
      const asm = 'jal func_80001000\nnop';
      const calls = extractFunctionCallsFromAssembly('n64', asm);
      expect(calls).toContain('func_80001000');
    });

    it('extracts ; comment references', () => {
      const asm = 'lui $at, %hi(SomeFunc) ; =SomeFunc';
      const calls = extractFunctionCallsFromAssembly('n64', asm);
      expect(calls).toContain('SomeFunc');
    });

    it('skips glabel/endlabel lines', () => {
      const asm = 'glabel func_80001000\njal helper\nnop';
      const calls = extractFunctionCallsFromAssembly('n64', asm);
      expect(calls).toContain('helper');
      expect(calls).not.toContain('func_80001000');
    });
  });

  it('throws for unsupported platform', () => {
    expect(() => extractFunctionCallsFromAssembly('saturn', 'nop')).toThrow('Unsupported platform');
  });
});

describe('listFunctionsFromAsmModule', () => {
  describe('ARM', () => {
    it('lists functions with thumb_func_start/end markers', () => {
      const asm = [
        '\tthumb_func_start FuncA',
        'FuncA: @ 0x08001000',
        '\tpush {lr}',
        '\tbx lr',
        '\tthumb_func_end FuncA',
        '',
        '\tthumb_func_start FuncB',
        'FuncB: @ 0x08001010',
        '\tmov r0, #1',
        '\tbx lr',
        '\tthumb_func_end FuncB',
      ].join('\n');

      const funcs = listFunctionsFromAsmModule('gba', asm);
      expect(funcs).toHaveLength(2);
      expect(funcs[0].name).toBe('FuncA');
      expect(funcs[1].name).toBe('FuncB');
      expect(funcs[0].code).toContain('push {lr}');
    });

    it('handles functions without explicit end markers', () => {
      const asm = [
        '\tthumb_func_start FuncA',
        'FuncA:',
        '\tpush {lr}',
        '\tbx lr',
        '\tthumb_func_start FuncB',
        'FuncB:',
        '\tmov r0, #1',
        '\tbx lr',
      ].join('\n');

      const funcs = listFunctionsFromAsmModule('gba', asm);
      expect(funcs).toHaveLength(2);
      expect(funcs[0].name).toBe('FuncA');
      expect(funcs[1].name).toBe('FuncB');
    });

    it('returns empty array for empty input', () => {
      expect(listFunctionsFromAsmModule('gba', '')).toEqual([]);
    });
  });

  describe('MIPS', () => {
    it('lists functions with glabel markers', () => {
      const asm = [
        'glabel func_80001000',
        '/* 000000 80001000 27BDFFD0 */  addiu $sp, $sp, -0x30',
        '/* 000004 80001004 03E00008 */  jr    $ra',
        '.size func_80001000, . - func_80001000',
        '',
        'glabel func_80002000',
        '/* 000000 80002000 27BDFFD0 */  addiu $sp, $sp, -0x20',
        '/* 000004 80002004 03E00008 */  jr    $ra',
        '.size func_80002000, . - func_80002000',
      ].join('\n');

      const funcs = listFunctionsFromAsmModule('n64', asm);
      expect(funcs).toHaveLength(2);
      expect(funcs[0].name).toBe('func_80001000');
      expect(funcs[1].name).toBe('func_80002000');
    });
  });
});

describe('extractAsmFunctionBody', () => {
  describe('ARM', () => {
    it('strips thumb_func_start/end and function label', () => {
      const asm = [
        '\tthumb_func_start MyFunc',
        'MyFunc: @ 0x08001000',
        '\tpush {r4, lr}',
        '\tmov r0, #1',
        '\tpop {r4}',
        '\tbx lr',
        '\tthumb_func_end MyFunc',
      ].join('\n');

      const body = extractAsmFunctionBody('gba', asm);
      expect(body).not.toContain('thumb_func_start');
      expect(body).not.toContain('thumb_func_end');
      expect(body).not.toContain('MyFunc:');
      expect(body).toContain('push {r4, lr}');
      expect(body).toContain('mov r0, #1');
    });

    it('strips .align directives', () => {
      const asm = [
        '\tthumb_func_start MyFunc',
        'MyFunc:',
        '\t.align 2, 0',
        '\tpush {lr}',
        '\tbx lr',
        '\tthumb_func_end MyFunc',
      ].join('\n');

      const body = extractAsmFunctionBody('gba', asm);
      expect(body).not.toContain('.align');
      expect(body).toContain('push {lr}');
    });

    it('returns empty string for function with no instructions', () => {
      const asm = '\tthumb_func_start Empty\nEmpty:\n\tthumb_func_end Empty';
      const body = extractAsmFunctionBody('gba', asm);
      expect(body).toBe('');
    });
  });

  describe('MIPS', () => {
    it('strips glabel and .size directives', () => {
      const asm = [
        'glabel func_80001000',
        '/* 000000 80001000 27BDFFD0 */  addiu $sp, $sp, -0x30',
        '/* 000004 80001004 03E00008 */  jr    $ra',
        '.size func_80001000, . - func_80001000',
      ].join('\n');

      const body = extractAsmFunctionBody('n64', asm);
      expect(body).not.toContain('glabel');
      expect(body).not.toContain('.size');
      expect(body).toContain('addiu $sp, $sp, -0x30');
    });

    it('strips ; comments and normalizes spacing', () => {
      const asm = ['glabel func_80001000', '/* 000000 80001000 27BDFFD0 */  addiu $sp, $sp, -0x30 ; comment here'].join(
        '\n',
      );

      const body = extractAsmFunctionBody('n64', asm);
      expect(body).not.toContain('; comment');
    });
  });
});

describe('stripCommentaries', () => {
  it('strips ARM @ comments', () => {
    const result = stripCommentaries('mov r0, #1 @ load constant');
    expect(result).toBe('mov r0, #1');
  });

  it('strips MIPS ; comments', () => {
    const result = stripCommentaries('addiu $sp, $sp, -0x30 ; stack frame');
    expect(result).toBe('addiu $sp, $sp, -0x30');
  });

  it('strips C-style block comments', () => {
    const result = stripCommentaries('/* 000000 80001000 27BDFFD0 */  addiu $sp, $sp, -0x30');
    expect(result).toBe('  addiu $sp, $sp, -0x30');
  });

  it('strips // comments', () => {
    const result = stripCommentaries('nop // no-op');
    expect(result).toBe('nop');
  });

  it('preserves line structure', () => {
    const input = 'line1 @ comment\nline2 @ comment\nline3';
    const result = stripCommentaries(input);
    expect(result.split('\n')).toHaveLength(3);
  });
});

describe('countBodyLinesFromAsmFunction', () => {
  it('counts non-empty body lines for ARM', () => {
    const asm = [
      '\tthumb_func_start MyFunc',
      'MyFunc:',
      '\tpush {r4, lr}',
      '\tmov r0, #1',
      '\tpop {r4}',
      '\tbx lr',
      '\tthumb_func_end MyFunc',
    ].join('\n');

    expect(countBodyLinesFromAsmFunction('gba', asm)).toBe(4);
  });

  it('returns 0 for empty function', () => {
    const asm = '\tthumb_func_start Empty\nEmpty:\n\tthumb_func_end Empty';
    expect(countBodyLinesFromAsmFunction('gba', asm)).toBe(0);
  });

  it('counts MIPS lines', () => {
    const asm = [
      'glabel func_80001000',
      '/* 000000 80001000 27BDFFD0 */  addiu $sp, $sp, -0x30',
      '/* 000004 80001004 03E00008 */  jr    $ra',
      '/* 000008 80001008 27BD0030 */   addiu $sp, $sp, 0x30',
      '.size func_80001000, . - func_80001000',
    ].join('\n');

    expect(countBodyLinesFromAsmFunction('n64', asm)).toBe(3);
  });
});
