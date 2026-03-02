import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseMapFile, resolveObjectPathFromSourceFile } from './map-file.js';

describe('parseMapFile', () => {
  it('parses SA3-style map with ARM symbols', () => {
    const mapContent = `
 .text          0x0809947c     0x22f4 asm/character_select.o
                0x0809947c                Task_809947C
                0x0809b758                TaskDestructor_CharacterSelect

 .text          0x0809b770      0x1a0 asm/ings_ings_ings.o
                0x0809b770                CreateIngsIngsIngs
`;
    const result = parseMapFile(mapContent);

    expect(result.get('Task_809947C')).toBe('asm/character_select.o');
    expect(result.get('TaskDestructor_CharacterSelect')).toBe('asm/character_select.o');
    expect(result.get('CreateIngsIngsIngs')).toBe('asm/ings_ings_ings.o');
  });

  it('parses AF-style map with .NON_MATCHING suffixes', () => {
    const mapContent = `
 .text          0x80060e60      0x3f0 build/src/ac_depart.o
                0x80060e60                ac_depart_init
                0x80060fc0                ac_depart_init.NON_MATCHING
                0x80061180                ac_depart_cleanup
`;
    const result = parseMapFile(mapContent);

    expect(result.get('ac_depart_init')).toBe('build/src/ac_depart.o');
    // .NON_MATCHING alias maps to the same symbol name after stripping
    expect(result.get('ac_depart_cleanup')).toBe('build/src/ac_depart.o');
  });

  it('handles multiple object files across sections', () => {
    const mapContent = `
 .text          0x08000000      0x100 asm/main.o
                0x08000000                main_func

 .data          0x08100000      0x200 asm/main.o
                0x08100000                main_data

 .text          0x08001000      0x200 asm/utils.o
                0x08001000                util_func
`;
    const result = parseMapFile(mapContent);

    expect(result.get('main_func')).toBe('asm/main.o');
    expect(result.get('util_func')).toBe('asm/utils.o');
    // .data section symbols are not captured (only .text)
    expect(result.has('main_data')).toBe(false);
  });

  it('returns undefined for symbols not in the map', () => {
    const mapContent = `
 .text          0x08000000      0x100 asm/main.o
                0x08000000                main_func
`;
    const result = parseMapFile(mapContent);

    expect(result.get('nonexistent_func')).toBeUndefined();
  });

  it('handles empty input', () => {
    const result = parseMapFile('');
    expect(result.size).toBe(0);
  });

  it('stops associating symbols after a non-symbol line', () => {
    const mapContent = `
 .text          0x08000000      0x100 asm/first.o
                0x08000000                first_func
 *fill*         0x08000100       0x10
                0x08000110                stray_symbol
 .text          0x08000200      0x100 asm/second.o
                0x08000200                second_func
`;
    const result = parseMapFile(mapContent);

    expect(result.get('first_func')).toBe('asm/first.o');
    // stray_symbol after *fill* should NOT be associated with first.o
    expect(result.has('stray_symbol')).toBe(false);
    expect(result.get('second_func')).toBe('asm/second.o');
  });
});

describe('resolveObjectPathFromSourceFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('resolves .c to .o in the same directory', async () => {
    // Create src/core.o alongside src/core.c
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'core.o'), '');

    const result = await resolveObjectPathFromSourceFile('src/core.c', tmpDir);
    expect(result).toBe(path.join(tmpDir, 'src', 'core.o'));
  });

  it('resolves .c to .o under build/ directory', async () => {
    // Create build/src/core.o (no src/core.o alongside source)
    await fs.mkdir(path.join(tmpDir, 'build', 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'build', 'src', 'core.o'), '');

    const result = await resolveObjectPathFromSourceFile('src/core.c', tmpDir);
    expect(result).toBe(path.join(tmpDir, 'build', 'src', 'core.o'));
  });

  it('returns null when no .o file is found', async () => {
    const result = await resolveObjectPathFromSourceFile('src/missing.c', tmpDir);
    expect(result).toBeNull();
  });
});
