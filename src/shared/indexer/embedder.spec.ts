import { describe, expect, it } from 'vitest';

import { preprocessForEmbedding } from './embedder';

describe('preprocessForEmbedding', () => {
  it('strips ARM comments and markers from function code', () => {
    const asmCode = [
      '\tthumb_func_start MyFunc',
      'MyFunc: @ 0x08001000',
      '\tpush {r4, lr} @ save regs',
      '\tmov r0, #1',
      '\tpop {r4}',
      '\tbx lr',
      '\tthumb_func_end MyFunc',
    ].join('\n');

    const result = preprocessForEmbedding('gba', asmCode);
    expect(result).not.toContain('thumb_func_start');
    expect(result).not.toContain('thumb_func_end');
    expect(result).not.toContain('MyFunc:');
    expect(result).not.toContain('@ save regs');
    expect(result).toContain('push {r4, lr}');
    expect(result).toContain('mov r0, #1');
  });

  it('strips MIPS comments and markers from function code', () => {
    const asmCode = [
      'glabel func_80001000',
      '/* 000000 80001000 27BDFFD0 */  addiu $sp, $sp, -0x30 ; stack frame',
      '/* 000004 80001004 03E00008 */  jr    $ra',
      '.size func_80001000, . - func_80001000',
    ].join('\n');

    const result = preprocessForEmbedding('n64', asmCode);
    expect(result).not.toContain('glabel');
    expect(result).not.toContain('.size');
    expect(result).not.toContain('; stack frame');
    expect(result).toContain('addiu sp, sp, -0x30');
  });

  it('returns empty string for empty function', () => {
    const asmCode = '\tthumb_func_start Empty\nEmpty:\n\tthumb_func_end Empty';
    const result = preprocessForEmbedding('gba', asmCode);
    expect(result).toBe('');
  });

  it('strips objdiff address prefixes and REFERENCE annotations', () => {
    const objdiffAsm = [
      '0:       ldr r1, [pc, #0x4] # REFERENCE_.L8',
      '2:       mov r0, #0x0',
      '4:       str r0, [r1, #0x4]',
      '6:       bx lr',
      '8:       .word gInputRecorder',
    ].join('\n');

    const result = preprocessForEmbedding('gba', objdiffAsm);
    expect(result).not.toMatch(/^[0-9a-f]+:/m);
    expect(result).not.toContain('# REFERENCE_');
    expect(result).toContain('mov r0, #0x0');
    expect(result).toContain('.word gInputRecorder');
  });

  it('strips objdiff line number annotations before instructions', () => {
    const objdiffAsm = ['2c:  27add r2, #0x4', '2e:  13ldr r1, [r2, #0x0]'].join('\n');

    const result = preprocessForEmbedding('gba', objdiffAsm);
    expect(result).toContain('add r2, #0x4');
    expect(result).toContain('ldr r1, [r2, #0x0]');
    expect(result).not.toMatch(/^\d+[a-z]/m);
  });

  it('normalizes Thumb s-suffix instructions', () => {
    const rawAsm = [
      '\tthumb_func_start Fn',
      'Fn: @ 0x08001000',
      '\tadds r0, r1, r2',
      '\tmovs r0, #0xff',
      '\tlsls r0, r0, #0x10',
      '\tands r0, r1',
      '\torrs r3, r2',
      '\tnegs r0, r0',
      '\tthumb_func_end Fn',
    ].join('\n');

    const result = preprocessForEmbedding('gba', rawAsm);
    expect(result).toContain('add r0, r1, r2');
    expect(result).toContain('mov r0, #0xff');
    expect(result).toContain('lsl r0, r0, #0x10');
    expect(result).toContain('and r0, r1');
    expect(result).toContain('orr r3, r2');
    expect(result).toContain('neg r0, r0');
    expect(result).not.toMatch(/\b(adds|movs|lsls|ands|orrs|negs)\b/);
  });

  it('normalizes .4byte to .word', () => {
    const rawAsm = [
      '\tthumb_func_start Fn',
      'Fn: @ 0x08001000',
      '\tldr r0, _08001010 @ =gData',
      '\tbx lr',
      '_08001010: .4byte gData',
      '\tthumb_func_end Fn',
    ].join('\n');

    const result = preprocessForEmbedding('gba', rawAsm);
    expect(result).toContain('.word gData');
    expect(result).not.toContain('.4byte');
  });

  it('strips MIPS nonmatching directive', () => {
    const asmCode = [
      'glabel func_8086F310_jp',
      '/* 000000 8086F310 27BDFFD0 */  addiu $sp, $sp, -0x30',
      'nonmatching func_8086F310_jp, 0x4C',
      '/* 000004 8086F314 03E00008 */  jr    $ra',
      '.size func_8086F310_jp, . - func_8086F310_jp',
    ].join('\n');

    const result = preprocessForEmbedding('n64', asmCode);
    expect(result).not.toContain('nonmatching');
    expect(result).toContain('addiu');
    expect(result).toContain('jr');
  });

  it('strips MIPS register $ prefix', () => {
    const asmCode = [
      'glabel func_80001000',
      '/* 000000 80001000 27BDFFD0 */  addiu $sp, $sp, -0x30',
      '/* 000004 80001004 AFBF001C */  sw    $ra, 0x1c($sp)',
      '/* 000008 80001008 AFA40030 */  sw    $a0, 0x30($sp)',
      '/* 00000C 8000100C 0320F809 */  jalr  $t9',
      '/* 000010 80001010 00000000 */  nop',
      '/* 000014 80001014 8FBF001C */  lw    $31, 0x1c($sp)',
      '/* 000018 80001018 44800000 */  mtc1  $zero, $fv0',
      '/* 00001C 8000101C 46006006 */  mov.s $ft3, $ft0',
      '/* 000020 80001020 44040000 */  mfc1  $a0, $f12',
      '.size func_80001000, . - func_80001000',
    ].join('\n');

    const result = preprocessForEmbedding('n64', asmCode);
    expect(result).toContain('addiu sp, sp, -0x30');
    expect(result).toContain('sw ra, 0x1c(sp)');
    expect(result).toContain('sw a0, 0x30(sp)');
    expect(result).toContain('jalr t9');
    expect(result).toContain('lw 31, 0x1c(sp)');
    // FP registers: $fv0 → fv0, $ft3 → ft3, $f12 → f12
    expect(result).toContain('mtc1 zero, fv0');
    expect(result).toContain('mov.s ft3, ft0');
    expect(result).toContain('mfc1 a0, f12');
    expect(result).not.toMatch(/\$[a-z]/);
    expect(result).not.toMatch(/\$\d/);
  });

  it('normalizes .L hex labels', () => {
    const objdiffAsm = ['0:       beq r0, r1, .L2c11', '4:       lui a1, %hi(data)', '.L2c11:', '8:       jr ra'].join(
      '\n',
    );

    const rawAsm = [
      'glabel func_8086F310',
      '/* 000000 8086F310 */  beq $zero, $at, .L8086F350',
      '/* 000004 8086F314 */  lui $a1, (0x10108 >> 16)',
      '.L8086F350:',
      '/* 000040 8086F350 */  jr $ra',
      '.size func_8086F310, . - func_8086F310',
    ].join('\n');

    const objdiffResult = preprocessForEmbedding('n64', objdiffAsm);
    const rawResult = preprocessForEmbedding('n64', rawAsm);

    expect(objdiffResult).toContain('.Lx');
    expect(objdiffResult).not.toContain('.L2c11');
    expect(rawResult).toContain('.Lx');
    expect(rawResult).not.toContain('.L8086F350');
  });

  it('normalizes MIPS relocation syntax', () => {
    // Matched (objdiff) style
    const objdiffAsm = [
      '0:       lui a1, %hi(common_data+0x105a4)',
      '4:       addiu a1, a1, %lo(common_data+0x105a4)',
    ].join('\n');

    // Unmatched (.s file) style
    const rawAsm = [
      'glabel func_80001000',
      '/* 000000 80001000 */  lui $at, (0x10108 >> 16)',
      '/* 000004 80001004 */  addiu $v0, $v0, (0x106DC & 0xFFFF)',
      '.size func_80001000, . - func_80001000',
    ].join('\n');

    const objdiffResult = preprocessForEmbedding('n64', objdiffAsm);
    const rawResult = preprocessForEmbedding('n64', rawAsm);

    // Both should normalize to the same generic form
    expect(objdiffResult).toContain('%hi(x)');
    expect(objdiffResult).toContain('%lo(x)');
    expect(objdiffResult).not.toContain('common_data');

    expect(rawResult).toContain('%hi(x)');
    expect(rawResult).toContain('%lo(x)');
    expect(rawResult).not.toContain('0x10108');
    expect(rawResult).not.toContain('0x106DC');
  });

  it('normalizes constant pool references to unified format', () => {
    // Raw .s style: label-based pool reference
    const rawAsm = [
      '\tthumb_func_start Fn',
      'Fn: @ 0x08001000',
      '\tldr r0, _08001010 @ =gData',
      '\tldr r1, _08001014 @ =gFlags',
      '\tbx lr',
      '_08001010: .4byte gData',
      '_08001014: .4byte gFlags',
      '\tthumb_func_end Fn',
    ].join('\n');

    const rawResult = preprocessForEmbedding('gba', rawAsm);

    // Objdiff style: pc-relative pool reference
    const objdiffAsm = [
      '0:       ldr r0, [pc, #0x8] # REFERENCE_.L10',
      '2:       ldr r1, [pc, #0x8] # REFERENCE_.L14',
      '4:       bx lr',
      '8:       .word gData',
      'c:       .word gFlags',
    ].join('\n');

    const objdiffResult = preprocessForEmbedding('gba', objdiffAsm);

    // Both should normalize pool loads to the same format
    expect(rawResult).toContain('ldr r0, [pool]');
    expect(rawResult).toContain('ldr r1, [pool]');
    expect(objdiffResult).toContain('ldr r0, [pool]');
    expect(objdiffResult).toContain('ldr r1, [pool]');

    // ROM-address label definitions should be stripped
    expect(rawResult).not.toMatch(/_08001010/);
    expect(rawResult).not.toMatch(/_08001014/);

    // Both should have the .word data
    expect(rawResult).toContain('.word gData');
    expect(objdiffResult).toContain('.word gData');
  });
});
