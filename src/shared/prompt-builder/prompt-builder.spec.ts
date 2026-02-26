import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { KappaDb, KappaDbDump } from '~/shared/kappa-db/kappa-db.js';

import { craftPrompt } from './craft-prompt.js';
import { createDecompilePrompt } from './prompt-builder.js';

describe('craftPrompt', () => {
  it('builds a basic prompt with assembly and platform info', () => {
    const result = craftPrompt({
      platform: 'gba',
      modulePath: 'src/battle.s',
      asmName: 'BattleInit',
      asmCode: 'push {r4, lr}\nmov r4, r0\nbx lr',
      calledFunctionsDeclarations: {},
      sampling: [],
      typeDefinitions: [],
    });

    expect(result).toContain('BattleInit');
    expect(result).toContain('ARMv4T');
    expect(result).toContain('Game Boy Advance');
    expect(result).toContain('src/battle.s');
    expect(result).toContain('push {r4, lr}');
    expect(result).toContain('# Rules');
  });

  it('includes example functions when sampling has non-caller examples', () => {
    const result = craftPrompt({
      platform: 'n64',
      modulePath: 'src/actor.s',
      asmName: 'ActorUpdate',
      asmCode: 'jr ra\nnop',
      calledFunctionsDeclarations: {},
      sampling: [
        {
          name: 'ActorInit',
          cCode: 'void ActorInit(void) { }',
          asmCode: 'jr ra\nnop',
          callsTarget: false,
        },
      ],
      typeDefinitions: [],
    });

    expect(result).toContain('# Examples');
    expect(result).toContain('ActorInit');
    expect(result).toContain('void ActorInit(void) { }');
    expect(result).toContain('MIPS');
    expect(result).toContain('Nintendo 64');
  });

  it('includes functions calling target when sampling has callers', () => {
    const result = craftPrompt({
      platform: 'gba',
      modulePath: 'src/main.s',
      asmName: 'MainLoop',
      asmCode: 'bx lr',
      calledFunctionsDeclarations: {},
      sampling: [
        {
          name: 'GameLoop',
          cCode: 'void GameLoop(void) { MainLoop(); }',
          asmCode: 'bl MainLoop\nbx lr',
          callsTarget: true,
        },
      ],
      typeDefinitions: [],
    });

    expect(result).toContain('# Functions that call the target assembly');
    expect(result).toContain('GameLoop');
  });

  it('includes target assembly declaration', () => {
    const result = craftPrompt({
      platform: 'gba',
      modulePath: 'src/main.s',
      asmName: 'Foo',
      asmCode: 'bx lr',
      asmDeclaration: 'void Foo(int x)',
      calledFunctionsDeclarations: {},
      sampling: [],
      typeDefinitions: [],
    });

    expect(result).toContain('# Function declaration for the target assembly');
    expect(result).toContain('void Foo(int x)');
  });

  it('includes called function declarations', () => {
    const result = craftPrompt({
      platform: 'gba',
      modulePath: 'src/main.s',
      asmName: 'Foo',
      asmCode: 'bx lr',
      calledFunctionsDeclarations: {
        Bar: 'int Bar(void)',
        Baz: 'void Baz(int)',
      },
      sampling: [],
      typeDefinitions: [],
    });

    expect(result).toContain('# Declarations for the functions called from the target assembly');
    expect(result).toContain('`int Bar(void)`');
    expect(result).toContain('`void Baz(int)`');
  });

  it('includes type definitions', () => {
    const result = craftPrompt({
      platform: 'gba',
      modulePath: 'src/main.s',
      asmName: 'Foo',
      asmCode: 'bx lr',
      calledFunctionsDeclarations: {},
      sampling: [],
      typeDefinitions: ['typedef struct { int x; int y; } Point;'],
    });

    expect(result).toContain('# Types definitions used in the declarations');
    expect(result).toContain('typedef struct { int x; int y; } Point;');
  });

  it('supports all 15 platform targets', () => {
    const platforms = [
      'gba',
      'nds',
      'n3ds',
      'n64',
      'gc',
      'wii',
      'ps1',
      'ps2',
      'psp',
      'win32',
      'switch',
      'android_x86',
      'irix',
      'saturn',
      'dreamcast',
    ] as const;

    for (const platform of platforms) {
      const result = craftPrompt({
        platform,
        modulePath: 'src/test.s',
        asmName: 'TestFunc',
        asmCode: 'nop',
        calledFunctionsDeclarations: {},
        sampling: [],
        typeDefinitions: [],
      });

      // Should not contain any unreplaced template variables
      expect(result).not.toContain('{assemblyLanguage}');
      expect(result).not.toContain('{platformName}');
    }
  });
});

describe('createDecompilePrompt', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-builder-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function createTestDb(overrides: Partial<KappaDbDump> = {}): KappaDb {
    const dump: KappaDbDump = {
      decompFunctions: [
        {
          id: 'id:TargetFunc',
          name: 'TargetFunc',
          asmCode: 'push {r4, lr}\nbx lr',
          asmModulePath: 'src/main.s',
          callsFunctions: ['id:HelperFunc'],
        },
        {
          id: 'id:HelperFunc',
          name: 'HelperFunc',
          cCode: 'void HelperFunc(void) { }',
          asmCode: 'bx lr',
          asmModulePath: 'src/helper.s',
          callsFunctions: [],
        },
        {
          id: 'id:CallerFunc',
          name: 'CallerFunc',
          cCode: 'void CallerFunc(void) { TargetFunc(); }',
          asmCode: 'bl TargetFunc\nbx lr',
          asmModulePath: 'src/caller.s',
          callsFunctions: ['id:TargetFunc'],
        },
      ],
      vectors: [
        { id: 'id:TargetFunc', embedding: [1, 0, 0] },
        { id: 'id:HelperFunc', embedding: [0.9, 0.1, 0] },
        { id: 'id:CallerFunc', embedding: [0.8, 0.2, 0] },
      ],
      ...overrides,
    };

    return KappaDb.fromDump(dump, 'gba');
  }

  it('generates a prompt for a target function', async () => {
    const db = createTestDb();

    const prompt = await createDecompilePrompt({
      db,
      functionId: 'id:TargetFunc',
      projectPath: tempDir,
      platform: 'gba',
    });

    expect(prompt).toContain('TargetFunc');
    expect(prompt).toContain('push {r4, lr}');
    expect(prompt).toContain('ARMv4T');
    expect(prompt).toContain('Game Boy Advance');
  });

  it('includes similar functions with cCode in sampling', async () => {
    const db = createTestDb();

    const prompt = await createDecompilePrompt({
      db,
      functionId: 'id:TargetFunc',
      projectPath: tempDir,
      platform: 'gba',
    });

    // HelperFunc has cCode and is similar (via vector search)
    expect(prompt).toContain('HelperFunc');
    expect(prompt).toContain('void HelperFunc(void) { }');
  });

  it('includes caller functions in sampling', async () => {
    const db = createTestDb();

    const prompt = await createDecompilePrompt({
      db,
      functionId: 'id:TargetFunc',
      projectPath: tempDir,
      platform: 'gba',
    });

    // CallerFunc calls TargetFunc and has cCode
    expect(prompt).toContain('CallerFunc');
    expect(prompt).toContain('void CallerFunc(void) { TargetFunc(); }');
  });

  it('throws for unknown function ID', async () => {
    const db = createTestDb();

    await expect(
      createDecompilePrompt({
        db,
        functionId: 'id:NonExistent',
        projectPath: tempDir,
        platform: 'gba',
      }),
    ).rejects.toThrow('Function not found: id:NonExistent');
  });

  it('finds declarations from C/H files in projectPath', async () => {
    // Create a header file with a declaration for HelperFunc
    const includeDir = path.join(tempDir, 'include');
    await fs.mkdir(includeDir, { recursive: true });
    await fs.writeFile(path.join(includeDir, 'helper.h'), 'void HelperFunc(int param);\nvoid TargetFunc(int x);\n');

    const db = createTestDb();

    const prompt = await createDecompilePrompt({
      db,
      functionId: 'id:TargetFunc',
      projectPath: tempDir,
      platform: 'gba',
    });

    // Should find the declaration for HelperFunc (called from TargetFunc)
    expect(prompt).toContain('void HelperFunc(int param)');
    // Should find the declaration for TargetFunc itself
    expect(prompt).toContain('void TargetFunc(int x)');
  });

  it('finds type definitions used in declarations', async () => {
    const includeDir = path.join(tempDir, 'include');
    await fs.mkdir(includeDir, { recursive: true });
    await fs.writeFile(path.join(includeDir, 'types.h'), 'typedef struct { int x; int y; } Position;\n');
    await fs.writeFile(path.join(includeDir, 'funcs.h'), 'void TargetFunc(Position *pos);\n');

    const db = createTestDb();

    const prompt = await createDecompilePrompt({
      db,
      functionId: 'id:TargetFunc',
      projectPath: tempDir,
      platform: 'gba',
    });

    expect(prompt).toContain('Position');
    expect(prompt).toContain('typedef struct { int x; int y; } Position;');
  });
});
