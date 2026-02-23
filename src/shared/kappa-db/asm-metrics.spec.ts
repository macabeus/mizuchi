import { describe, expect, it } from 'vitest';

import { countAsmMetrics } from './asm-metrics';

describe('countAsmMetrics', () => {
  describe('ARM/Thumb', () => {
    it('counts instructions, branches, and labels in Format A assembly', () => {
      const asm = [
        'sub_08001234: @ 0x08001234',
        '	push {r4, lr}',
        '	mov r0, #1',
        '	cmp r0, #0',
        '	beq .L0',
        '	mov r1, #2',
        '	bl sub_08005678',
        '.L0:',
        '	pop {r4}',
        '	pop {r0}',
        '	bx r0',
      ].join('\n');

      const metrics = countAsmMetrics(asm, 'arm');
      // push, mov, cmp, beq, mov, bl, pop, pop, bx = 9 instructions
      expect(metrics.instructionCount).toBe(9);
      expect(metrics.branchCount).toBe(1); // beq

      expect(metrics.labelCount).toBe(1); // .L0:
    });

    it('counts Format B labels (_hex:)', () => {
      const asm = [
        '	thumb_func_start sub_080AB000',
        'sub_080AB000: @ 0x080AB000',
        '	push {lr}',
        '	movs r0, #1',
        '	bne _080AB010',
        '_080AB010:',
        '	pop {r0}',
        '	bx r0',
      ].join('\n');

      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.labelCount).toBe(1); // _080AB010:
      expect(metrics.branchCount).toBe(1); // bne
      expect(metrics.instructionCount).toBe(5); // push, movs, bne, pop, bx
    });

    it('counts Format B labels with data directives (_hex: .4byte)', () => {
      const asm = [
        '	thumb_func_start sub_080AB000',
        'sub_080AB000: @ 0x080AB000',
        '	push {lr}',
        '	ldr r0, _080AB010',
        '	bl some_func',
        '_080AB010: .4byte gStageData',
        '_080AB014: .4byte 0x00000001',
        '	pop {r0}',
        '	bx r0',
      ].join('\n');

      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.labelCount).toBe(2); // _080AB010, _080AB014
      expect(metrics.instructionCount).toBe(5); // push, ldr, bl, pop, bx
    });

    it('does not count bic/bics as branches', () => {
      const asm = ['	bic r0, r1', '	bics r2, r3'].join('\n');
      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.branchCount).toBe(0);
      expect(metrics.instructionCount).toBe(2);
    });

    it('does not count bx as a branch or jump', () => {
      const asm = '	bx lr';
      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.branchCount).toBe(0);

      expect(metrics.instructionCount).toBe(1);
    });

    it('counts bl as an instruction, not a branch', () => {
      const asm = '	bl sub_08001234';
      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.branchCount).toBe(0);
      expect(metrics.instructionCount).toBe(1);
    });

    it('does not count directives as instructions', () => {
      const asm = ['	.align 2, 0', '	.4byte 0x12345678', '	.word 0xDEADBEEF', '	.hword 0x1234', '	mov r0, #1'].join('\n');
      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.instructionCount).toBe(1); // only mov
    });

    it('handles empty asmCode', () => {
      const metrics = countAsmMetrics('', 'arm');
      expect(metrics.instructionCount).toBe(0);
      expect(metrics.branchCount).toBe(0);

      expect(metrics.labelCount).toBe(0);
    });

    it('strips @ comments before parsing', () => {
      const asm = '	mov r0, #1 @ load constant';
      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.instructionCount).toBe(1);
    });

    it('detects thumb encoding via thumb_func_start', () => {
      const asm = ['	thumb_func_start sub_080AB000', 'sub_080AB000: @ 0x080AB000', '	push {lr}', '	bx lr'].join('\n');
      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.armEncoding).toBe('thumb');
      expect(metrics.instructionCount).toBe(2); // push + bx
    });

    it('detects arm32 encoding via arm_func_start', () => {
      const asm = ['	arm_func_start IntrMain', 'IntrMain: @ 0x080000FC', '	mov r3, #0x04000000', '	bx lr'].join('\n');
      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.armEncoding).toBe('arm32');
      expect(metrics.instructionCount).toBe(2); // mov + bx, not arm_func_start
    });

    it('returns undefined armEncoding when no func_start marker is present', () => {
      const asm = ['push {lr}', 'mov r0, #1', 'pop {r0}', 'bx r0'].join('\n');
      const metrics = countAsmMetrics(asm, 'arm');
      expect(metrics.armEncoding).toBeUndefined();
    });
  });

  describe('MIPS', () => {
    it('counts instructions, branches, and labels', () => {
      const asm = [
        'glabel func_80001000',
        '/* 000000 80001000 27BDFFD0 */  addiu $sp, $sp, -0x30',
        '/* 000004 80001004 AFBF002C */  sw    $ra, 0x2c($sp)',
        '/* 000008 80001008 10400005 */  beq   $v0, $zero, .L80001020',
        '/* 00000C 8000100C 00000000 */   nop',
        '/* 000010 80001010 0C000500 */  jal   func_80001400',
        '/* 000014 80001014 00000000 */   nop',
        '.L80001020:',
        '/* 000018 80001018 8FBF002C */  lw    $ra, 0x2c($sp)',
        '/* 00001C 8000101C 03E00008 */  jr    $ra',
        '/* 000020 80001020 27BD0030 */   addiu $sp, $sp, 0x30',
      ].join('\n');

      const metrics = countAsmMetrics(asm, 'mips');
      // addiu, sw, beq, nop, jal, nop, lw, jr, addiu = 9
      expect(metrics.instructionCount).toBe(9);
      expect(metrics.branchCount).toBe(1); // beq
      expect(metrics.labelCount).toBe(1); // .L80001020:
    });

    it('handles empty asmCode', () => {
      const metrics = countAsmMetrics('', 'mips');
      expect(metrics.instructionCount).toBe(0);
      expect(metrics.branchCount).toBe(0);

      expect(metrics.labelCount).toBe(0);
    });

    it('counts jr as an instruction', () => {
      const asm = '/* 00001C 8000101C 03E00008 */  jr    $ra';
      const metrics = countAsmMetrics(asm, 'mips');
      expect(metrics.instructionCount).toBe(1);
      expect(metrics.branchCount).toBe(0);
    });

    it('does not set armEncoding for MIPS', () => {
      const asm = '/* 000000 80001000 27BDFFD0 */  addiu $sp, $sp, -0x30';
      const metrics = countAsmMetrics(asm, 'mips');
      expect(metrics.armEncoding).toBeUndefined();
    });
  });
});
