import { describe, expect, it } from 'vitest';

import { stripTrailingAsmLines } from '~/shared/prompt-builder/craft-prompt.js';

describe('stripTrailingAsmLines', () => {
  it('strips section-separator comment and blank lines after an ARM function', () => {
    const asm = [
      '    thumb_func_start TaskDestructor_CharacterSelect',
      'TaskDestructor_CharacterSelect: @ 0x0809B758',
      '    push {lr}',
      '    ldrh r0, [r0, #6]',
      '    ldr r1, _0809B76C @ =0x030000C4',
      '    adds r0, r0, r1',
      '    ldr r0, [r0]',
      '    bl VramFree',
      '    pop {r0}',
      '    bx r0',
      '    .align 2, 0',
      '_0809B76C: .4byte 0x030000C4',
      '',
      '@ --- End of Character Select ---',
      '',
      '',
    ].join('\n');

    const expected = [
      '    thumb_func_start TaskDestructor_CharacterSelect',
      'TaskDestructor_CharacterSelect: @ 0x0809B758',
      '    push {lr}',
      '    ldrh r0, [r0, #6]',
      '    ldr r1, _0809B76C @ =0x030000C4',
      '    adds r0, r0, r1',
      '    ldr r0, [r0]',
      '    bl VramFree',
      '    pop {r0}',
      '    bx r0',
      '    .align 2, 0',
      '_0809B76C: .4byte 0x030000C4',
    ].join('\n');

    expect(stripTrailingAsmLines(asm)).toBe(expected);
  });

  it('preserves inline comments on instruction lines', () => {
    const asm = ['func: @ 0x08001000', '    push {lr} @ save return address', '    bx lr'].join('\n');

    expect(stripTrailingAsmLines(asm)).toBe(asm);
  });

  it('does not strip mid-function comment lines', () => {
    const asm = ['    push {lr}', '@ mid-function comment', '    bx lr'].join('\n');

    expect(stripTrailingAsmLines(asm)).toBe(asm);
  });

  it('strips trailing lines after a MIPS function (# comments)', () => {
    const asm = [
      'glabel my_function',
      '/* 0040A0 */ addiu $sp, $sp, -0x18',
      '/* 0040A8 */ jr    $ra',
      '/* 0040AC */  nop',
      '',
      '# End of my_function',
      '',
    ].join('\n');

    const expected = [
      'glabel my_function',
      '/* 0040A0 */ addiu $sp, $sp, -0x18',
      '/* 0040A8 */ jr    $ra',
      '/* 0040AC */  nop',
    ].join('\n');

    expect(stripTrailingAsmLines(asm)).toBe(expected);
  });

  it('strips trailing semicolon comments', () => {
    const asm = ['    push {lr}', '    bx lr', '; end of section', ''].join('\n');

    expect(stripTrailingAsmLines(asm)).toBe('    push {lr}\n    bx lr');
  });

  it('returns asm unchanged when there is no trailing junk', () => {
    const asm = '    push {lr}\n    bx lr';
    expect(stripTrailingAsmLines(asm)).toBe(asm);
  });

  it('handles empty string', () => {
    expect(stripTrailingAsmLines('')).toBe('');
  });
});
