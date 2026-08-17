import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIZUCHI_DB_VERSION, type MizuchiDbDump } from '~/shared/mizuchi-db/mizuchi-db';

import { cleanFunctionText, findNestedGitCheckouts, indexCodebase, writeMizuchiDb } from './indexer';

describe('cleanFunctionText', () => {
  it('strips END_NONMATCH prefix followed by blank lines', () => {
    const input = 'END_NONMATCH\n\nvoid sub_804AC58(ClosingWall *wall)\n{\n    // body\n}';
    const expected = 'void sub_804AC58(ClosingWall *wall)\n{\n    // body\n}';
    expect(cleanFunctionText(input)).toBe(expected);
  });

  it('strips END_NONMATCH prefix followed by single newline', () => {
    const input = 'END_NONMATCH\nvoid func(void) {}';
    expect(cleanFunctionText(input)).toBe('void func(void) {}');
  });

  it('does not modify text without END_NONMATCH', () => {
    const input = 'void myFunc(int x)\n{\n    return;\n}';
    expect(cleanFunctionText(input)).toBe(input);
  });

  it('does not strip END_NONMATCH in the middle of text', () => {
    const input = 'void func(void)\n{\n    END_NONMATCH\n}';
    expect(cleanFunctionText(input)).toBe(input);
  });
});

describe('writeMizuchiDb', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexer-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('writes mizuchi-db.json atomically', async () => {
    const dump: MizuchiDbDump = {
      version: MIZUCHI_DB_VERSION,
      platform: 'gba',
      decompFunctions: [
        {
          id: 'func1',
          name: 'func1',
          asmCode: 'push {lr}\nbx lr',
          asmModulePath: 'src/func1.s',
          callsFunctions: [],
        },
      ],
      vectors: [],
      indexMetadata: {
        contentHashes: {
          func1: 'abc123',
        },
      },
    };

    await writeMizuchiDb(tempDir, dump);

    const dbPath = path.join(tempDir, 'mizuchi-db.json');
    const raw = await fs.readFile(dbPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.decompFunctions).toHaveLength(1);
    expect(parsed.decompFunctions[0].name).toBe('func1');
    expect(parsed.platform).toBe('gba');
    expect(parsed.indexMetadata.contentHashes.func1).toBe('abc123');
  });

  it('does not leave tmp file on success', async () => {
    const dump: MizuchiDbDump = {
      version: MIZUCHI_DB_VERSION,
      platform: 'gba',
      decompFunctions: [],
      vectors: [],
      indexMetadata: {},
    };

    await writeMizuchiDb(tempDir, dump);

    const files = await fs.readdir(tempDir);
    expect(files).toEqual(['mizuchi-db.json']);
    expect(files).not.toContain('mizuchi-db.json.tmp');
  });
});

describe('indexCodebase', () => {
  let tempDir: string;
  let projectRoot: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexer-test-'));
    projectRoot = path.join(tempDir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('scans unmatched assembly functions from asm folders', async () => {
    // Create map file (empty — no matched functions)
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    // Create asm folder with a function
    const asmDir = path.join(projectRoot, 'asm', 'non_matching');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      [
        '\tthumb_func_start MyFunc',
        'MyFunc:',
        '\tpush {r4, lr}',
        '\tmov r0, #1',
        '\tpop {r4}',
        '\tbx lr',
        '\tthumb_func_end MyFunc',
      ].join('\n'),
    );

    const result = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm/non_matching'],
        matchingAsmFolders: [],
        excludeFromScan: [],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    expect(result.stats.unmatchedFunctions).toBe(1);
    expect(result.dump.decompFunctions).toHaveLength(1);
    expect(result.dump.decompFunctions[0].name).toBe('MyFunc');
    expect(result.dump.decompFunctions[0].asmCode).toBe(`\tthumb_func_start MyFunc
MyFunc:
\tpush {r4, lr}
\tmov r0, #1
\tpop {r4}
\tbx lr
\tthumb_func_end MyFunc`);
    expect(result.dump.decompFunctions[0].cCode).toBeUndefined();
  });

  it('skips empty functions', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectRoot, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'empty.s'),
      '\tthumb_func_start EmptyFunc\nEmptyFunc:\n\tthumb_func_end EmptyFunc',
    );

    const result = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    expect(result.stats.unmatchedFunctions).toBe(0);
    expect(result.dump.decompFunctions).toHaveLength(0);
  });

  it('skips NONMATCH-wrapped functions', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    // C source with two NONMATCH and one matching function.
    const srcDir = path.join(projectRoot, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(
      path.join(srcDir, 'test.c'),
      [
        '#include "global.h"',
        '',
        'NONMATCH("asm/non_matching/NonMatchA.inc", void NonMatchA(void)) { }',
        'END_NONMATCH',
        '',
        'NONMATCH("asm/non_matching/NonMatchB.inc", void NonMatchB(s32 *b)) { }',
        'END_NONMATCH',
        '',
        'void NormalFunc(int a) { }',
        '',
      ].join('\n'),
    );

    // Create the respective assembly for NormalFunc
    const matchingsDir = path.join(projectRoot, 'asm', 'matchings');
    await fs.mkdir(matchingsDir, { recursive: true });
    await fs.writeFile(
      path.join(matchingsDir, 'NormalFunc.s'),
      ['\tthumb_func_start NormalFunc', 'NormalFunc:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end NormalFunc'].join(
        '\n',
      ),
    );

    const result = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: [],
        matchingAsmFolders: ['asm/matchings'],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    const names = result.dump.decompFunctions.map((f) => f.name);
    // The normal function is matched (positive control)...
    expect(names).toContain('NormalFunc');
    // ...while the NONMATCH-wrapped functions are skipped.
    expect(names).not.toContain('NonMatchA');
    expect(names).not.toContain('NonMatchB');
    expect(result.stats.matchedFunctions).toBe(1);
  });

  it('skips "#if 0"-wrapped functions', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    // C source with three "#if 0"-wrapped functions and one matching function.
    const srcDir = path.join(projectRoot, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(
      path.join(srcDir, 'test.c'),
      [
        '#include "global.h"',
        '',
        '#if 0',
        'void DisabledFuncA(void) { }',
        '#endif',
        '',
        '#if 0',
        'void DisabledFuncB(s32 *b) { }',
        '',
        'void DisabledFuncC(s64 *c) { }',
        '#endif',
        '',
        'void NormalFunc(int a) { }',
        '',
      ].join('\n'),
    );

    // Create the respective assembly for NormalFunc
    const matchingsDir = path.join(projectRoot, 'asm', 'matchings');
    await fs.mkdir(matchingsDir, { recursive: true });
    await fs.writeFile(
      path.join(matchingsDir, 'NormalFunc.s'),
      ['\tthumb_func_start NormalFunc', 'NormalFunc:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end NormalFunc'].join(
        '\n',
      ),
    );

    const result = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: [],
        matchingAsmFolders: ['asm/matchings'],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    const names = result.dump.decompFunctions.map((f) => f.name);
    // The normal function is matched (positive control)...
    expect(names).toContain('NormalFunc');
    // ...while the "#if 0"-wrapped functions are skipped.
    expect(names).not.toContain('DisabledFuncA');
    expect(names).not.toContain('DisabledFuncB');
    expect(names).not.toContain('DisabledFuncC');
    expect(result.stats.matchedFunctions).toBe(1);
  });

  it('skips "static inline" functions', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    // C source with three "static inline" functions and one matching function.
    const srcDir = path.join(projectRoot, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(
      path.join(srcDir, 'test.c'),
      [
        '#include "global.h"',
        '',
        'static inline void InlineFuncA(void) { }',
        '',
        'static inline void InlineFuncB(s32 *b) { }',
        '',
        'void NormalFunc(int a) { }',
        '',
      ].join('\n'),
    );

    // Create the respective assembly for NormalFunc
    const matchingsDir = path.join(projectRoot, 'asm', 'matchings');
    await fs.mkdir(matchingsDir, { recursive: true });
    await fs.writeFile(
      path.join(matchingsDir, 'NormalFunc.s'),
      ['\tthumb_func_start NormalFunc', 'NormalFunc:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end NormalFunc'].join(
        '\n',
      ),
    );

    const result = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: [],
        matchingAsmFolders: ['asm/matchings'],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    const names = result.dump.decompFunctions.map((f) => f.name);
    // The normal function is matched (positive control)...
    expect(names).toContain('NormalFunc');
    // ...while the "static inline"-wrapped functions are skipped.
    expect(names).not.toContain('InlineFuncA');
    expect(names).not.toContain('InlineFuncB');
    expect(result.stats.matchedFunctions).toBe(1);
  });

  it('computes incremental diff against existing DB', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    // Create asm folder
    const asmDir = path.join(projectRoot, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      [
        '\tthumb_func_start FuncA',
        'FuncA:',
        '\tpush {lr}',
        '\tbx lr',
        '\tthumb_func_end FuncA',
        '',
        '\tthumb_func_start FuncB',
        'FuncB:',
        '\tmov r0, #1',
        '\tbx lr',
        '\tthumb_func_end FuncB',
      ].join('\n'),
    );

    // First index
    const result1 = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    expect(result1.stats.newCount).toBe(2);
    expect(result1.stats.unchangedCount).toBe(0);

    // Write DB to project path
    await writeMizuchiDb(projectRoot, result1.dump);

    // Re-index without changes
    const result2 = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    expect(result2.stats.newCount).toBe(0);
    expect(result2.stats.unchangedCount).toBe(2);
    expect(result2.stats.updatedCount).toBe(0);
    expect(result2.stats.removedCount).toBe(0);
  });

  it('detects updated functions on re-index', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectRoot, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    // First index
    const result1 = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });
    await writeMizuchiDb(projectRoot, result1.dump);

    // Modify the function
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      [
        '\tthumb_func_start FuncA',
        'FuncA:',
        '\tpush {r4, lr}',
        '\tmov r0, #42',
        '\tpop {r4}',
        '\tbx lr',
        '\tthumb_func_end FuncA',
      ].join('\n'),
    );

    // Re-index
    const result2 = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    expect(result2.stats.updatedCount).toBe(1);
    expect(result2.stats.unchangedCount).toBe(0);
  });

  it('detects removed functions on re-index', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectRoot, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      [
        '\tthumb_func_start FuncA',
        'FuncA:',
        '\tpush {lr}',
        '\tbx lr',
        '\tthumb_func_end FuncA',
        '',
        '\tthumb_func_start FuncB',
        'FuncB:',
        '\tmov r0, #1',
        '\tbx lr',
        '\tthumb_func_end FuncB',
      ].join('\n'),
    );

    // First index
    const result1 = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });
    await writeMizuchiDb(projectRoot, result1.dump);

    // Remove FuncB
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    // Re-index
    const result2 = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    expect(result2.stats.removedCount).toBe(1);
    expect(result2.dump.decompFunctions).toHaveLength(1);
  });

  it('preserves existing embeddings for unchanged functions', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectRoot, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    // First index
    const result1 = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    // Add fake embedding to the dump
    result1.dump.vectors.push({ id: 'FuncA', embedding: [0.1, 0.2, 0.3] });
    await writeMizuchiDb(projectRoot, result1.dump);

    // Re-index without changes
    const result2 = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    // Embedding should be preserved
    expect(result2.dump.vectors).toHaveLength(1);
    expect(result2.dump.vectors[0].id).toBe('FuncA');
    expect(result2.dump.vectors[0].embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('handles missing asm directories gracefully', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const result = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['nonexistent/asm'],
        matchingAsmFolders: [],
        excludeFromScan: [],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    expect(result.stats.unmatchedFunctions).toBe(0);
    expect(result.dump.decompFunctions).toHaveLength(0);
  });

  it('reports progress callbacks', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectRoot, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    const progressCalls: string[] = [];

    await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
      onProgress: (p) => {
        progressCalls.push(p.phase);
      },
    });

    expect(progressCalls).toContain('scanning-c');
    expect(progressCalls).toContain('scanning-asm');
    expect(progressCalls).toContain('diffing');
    expect(progressCalls).toContain('writing');
  });

  it('extracts call graph from assembly', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectRoot, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      [
        '\tthumb_func_start Caller',
        'Caller:',
        '\tpush {lr}',
        '\tbl Helper',
        '\tbl AnotherFunc',
        '\tpop {r0}',
        '\tbx r0',
        '\tthumb_func_end Caller',
      ].join('\n'),
    );

    const result = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    const caller = result.dump.decompFunctions.find((f) => f.name === 'Caller');
    expect(caller).toBeDefined();
    expect(caller!.callsFunctions).toContain('Helper');
    expect(caller!.callsFunctions).toContain('AnotherFunc');
  });

  it('includes indexMetadata in dump', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectRoot, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    const result = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    expect(result.dump.platform).toBe('gba');
    expect(result.dump.indexMetadata.contentHashes).toBeDefined();
    expect(result.dump.indexMetadata.contentHashes!['FuncA']).toBeDefined();
    expect(typeof result.dump.indexMetadata.contentHashes!['FuncA']).toBe('string');
  });
});

describe('findNestedGitCheckouts', () => {
  let tempDir: string;
  let projectRoot: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexer-git-test-'));
    projectRoot = path.join(tempDir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
    // The project's own repo — must never be reported as a nested checkout
    await fs.mkdir(path.join(projectRoot, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns nothing when there are no nested checkouts', async () => {
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });

    expect(await findNestedGitCheckouts(projectRoot)).toEqual([]);
  });

  it('detects a worktree, whose .git is a file', async () => {
    const worktree = path.join(projectRoot, 'wt_old');
    await fs.mkdir(worktree, { recursive: true });
    await fs.writeFile(path.join(worktree, '.git'), 'gitdir: /project/.git/worktrees/wt_old');

    expect(await findNestedGitCheckouts(projectRoot)).toEqual(['wt_old']);
  });

  it('detects a clone, whose .git is a directory', async () => {
    await fs.mkdir(path.join(projectRoot, 'vendor', 'clone', '.git'), { recursive: true });

    expect(await findNestedGitCheckouts(projectRoot)).toEqual([path.join('vendor', 'clone')]);
  });

  it('reports several checkouts sorted', async () => {
    for (const name of ['wt_c', 'wt_a', 'wt_b']) {
      const dir = path.join(projectRoot, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, '.git'), 'gitdir: elsewhere');
    }

    expect(await findNestedGitCheckouts(projectRoot)).toEqual(['wt_a', 'wt_b', 'wt_c']);
  });

  it('stops descending once a checkout is found, so nested ones are not reported twice', async () => {
    const outer = path.join(projectRoot, 'wt_outer');
    const inner = path.join(outer, 'nested', 'wt_inner');
    await fs.mkdir(inner, { recursive: true });
    await fs.writeFile(path.join(outer, '.git'), 'gitdir: elsewhere');
    await fs.writeFile(path.join(inner, '.git'), 'gitdir: elsewhere');

    expect(await findNestedGitCheckouts(projectRoot)).toEqual(['wt_outer']);
  });

  it('ignores node_modules', async () => {
    await fs.mkdir(path.join(projectRoot, 'node_modules', 'pkg', '.git'), { recursive: true });

    expect(await findNestedGitCheckouts(projectRoot)).toEqual([]);
  });
});

describe('indexCodebase — nested git checkouts', () => {
  let tempDir: string;
  let projectRoot: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexer-wt-test-'));
    projectRoot = path.join(tempDir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('skips C sources inside a nested worktree instead of failing on them', async () => {
    const mapFilePath = path.join(projectRoot, 'test.map');
    await fs.writeFile(mapFilePath, '');

    // A stale worktree holding a pre-rename copy of the sources. Its object file
    // cannot be resolved, so scanning it would abort the whole index run.
    const worktreeSrc = path.join(projectRoot, 'wt_old', 'src');
    await fs.mkdir(worktreeSrc, { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'wt_old', '.git'), 'gitdir: /project/.git/worktrees/wt_old');
    await fs.writeFile(path.join(worktreeSrc, 'gfx.c'), 'int OldNameForFunc(void) { return 1; }');

    const asmDir = path.join(projectRoot, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    const result = await indexCodebase({
      config: {
        projectRoot,
        mapFilePath,
        target: 'gba',
        nonMatchingAsmFolders: ['asm'],
        matchingAsmFolders: [],
        excludeFromScan: ['tools'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });

    expect(result.stats.skippedGitCheckouts).toEqual(['wt_old']);
    expect(result.dump.decompFunctions.map((fn) => fn.name)).not.toContain('OldNameForFunc');
    expect(result.dump.decompFunctions.map((fn) => fn.name)).toContain('FuncA');
  });
});
