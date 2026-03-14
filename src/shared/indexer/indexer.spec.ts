import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIZUCHI_DB_VERSION, type MizuchiDbDump } from '~/shared/mizuchi-db/mizuchi-db';

import { cleanFunctionText, indexCodebase, writeMizuchiDb } from './indexer';

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
  let projectPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexer-test-'));
    projectPath = path.join(tempDir, 'project');
    await fs.mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('scans unmatched assembly functions from asm folders', async () => {
    // Create map file (empty — no matched functions)
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    // Create asm folder with a function
    const asmDir = path.join(projectPath, 'asm', 'non_matching');
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
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm/non_matching'],
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
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectPath, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'empty.s'),
      '\tthumb_func_start EmptyFunc\nEmptyFunc:\n\tthumb_func_end EmptyFunc',
    );

    const result = await indexCodebase({
      config: {
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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

  it('computes incremental diff against existing DB', async () => {
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    // Create asm folder
    const asmDir = path.join(projectPath, 'asm');
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
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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
    await writeMizuchiDb(projectPath, result1.dump);

    // Re-index without changes
    const result2 = await indexCodebase({
      config: {
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectPath, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    // First index
    const result1 = await indexCodebase({
      config: {
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });
    await writeMizuchiDb(projectPath, result1.dump);

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
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectPath, 'asm');
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
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
        maxRetries: 1,
        outputDir: tempDir,
        compilerScript: '',
        getContextScript: '',
        promptsDir: '',
      },
      objdiffDiffSettings: {},
    });
    await writeMizuchiDb(projectPath, result1.dump);

    // Remove FuncB
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    // Re-index
    const result2 = await indexCodebase({
      config: {
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectPath, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    // First index
    const result1 = await indexCodebase({
      config: {
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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
    await writeMizuchiDb(projectPath, result1.dump);

    // Re-index without changes
    const result2 = await indexCodebase({
      config: {
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const result = await indexCodebase({
      config: {
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['nonexistent/asm'],
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
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectPath, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    const progressCalls: string[] = [];

    await indexCodebase({
      config: {
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectPath, 'asm');
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
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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
    const mapFilePath = path.join(projectPath, 'test.map');
    await fs.writeFile(mapFilePath, '');

    const asmDir = path.join(projectPath, 'asm');
    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(
      path.join(asmDir, 'code.s'),
      ['\tthumb_func_start FuncA', 'FuncA:', '\tpush {lr}', '\tbx lr', '\tthumb_func_end FuncA'].join('\n'),
    );

    const result = await indexCodebase({
      config: {
        projectPath,
        mapFilePath,
        target: 'gba',
        verificationMode: 'objdiff',
        nonMatchingAsmFolders: ['asm'],
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
