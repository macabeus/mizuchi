import { describe, expect, it } from 'vitest';

import { type DecompFunctionDoc, KappaDb, type KappaDbDump } from './kappa-db';

function makeDump(overrides?: Partial<KappaDbDump>): KappaDbDump {
  return {
    decompFunctions: [
      {
        id: 'fn1',
        name: 'func_a',
        cCode: 'int func_a(void) { return 1; }',
        cModulePath: 'src/main.c',
        asmCode: 'mov r0, #1\nbx lr',
        asmModulePath: 'asm/main.s',
        callsFunctions: ['fn2'],
      },
      {
        id: 'fn2',
        name: 'func_b',
        asmCode: 'mov r0, #2\nbx lr',
        asmModulePath: 'asm/util.s',
        callsFunctions: [],
      },
      {
        id: 'fn3',
        name: 'func_c',
        cCode: 'int func_c(void) { return 3; }',
        cModulePath: 'src/util.c',
        asmCode: 'mov r0, #3\nbx lr',
        asmModulePath: 'asm/util.s',
        callsFunctions: ['fn1'],
      },
    ],
    vectors: [
      { id: 'fn1', embedding: [1, 0, 0] },
      { id: 'fn2', embedding: [0, 1, 0] },
      { id: 'fn3', embedding: [0.7, 0.7, 0] },
    ],
    ...overrides,
  };
}

describe('KappaDb', () => {
  describe('fromDump', () => {
    it('parses a dump correctly', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      expect(db.functions).toHaveLength(3);
      expect(db.vectors.size).toBe(3);
    });

    it('exposes the platform', () => {
      const db = KappaDb.fromDump(makeDump(), 'mips');
      expect(db.platform).toBe('mips');
    });
  });

  describe('getStats', () => {
    it('returns correct counts', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      const stats = db.getStats();

      expect(stats.totalFunctions).toBe(3);
      expect(stats.decompiledFunctions).toBe(2);
      expect(stats.asmOnlyFunctions).toBe(1);
      expect(stats.totalVectors).toBe(3);
      expect(stats.embeddingDimension).toBe(3);
    });
  });

  describe('getFunctionById', () => {
    it('returns the function for a known id', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      const fn = db.getFunctionById('fn2');
      expect(fn).toBeDefined();
      expect(fn!.name).toBe('func_b');
    });

    it('returns undefined for an unknown id', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      expect(db.getFunctionById('nonexistent')).toBeUndefined();
    });
  });

  describe('getCalledBy', () => {
    it('returns callers of a function', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      // fn1 calls fn2, so fn2 is called by fn1
      const callers = db.getCalledBy('fn2');
      expect(callers).toHaveLength(1);
      expect(callers[0].id).toBe('fn1');
    });

    it('returns multiple callers', () => {
      const db = KappaDb.fromDump(
        makeDump({
          decompFunctions: [
            { id: 'a', name: 'a', asmCode: '', asmModulePath: '', callsFunctions: ['c'] },
            { id: 'b', name: 'b', asmCode: '', asmModulePath: '', callsFunctions: ['c'] },
            { id: 'c', name: 'c', asmCode: '', asmModulePath: '', callsFunctions: [] },
          ],
        }),
        'arm',
      );
      const callers = db.getCalledBy('c');
      const ids = callers.map((f) => f.id).sort();
      expect(ids).toEqual(['a', 'b']);
    });

    it('returns empty array for a function with no callers', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      // fn1 is called by fn3 (fn3 calls fn1), but nobody calls fn3
      const callers = db.getCalledBy('fn3');
      expect(callers).toHaveLength(0);
    });

    it('returns empty array for unknown id', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      expect(db.getCalledBy('nonexistent')).toEqual([]);
    });

    it('caches the reverse index across calls', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      const first = db.getCalledBy('fn2');
      const second = db.getCalledBy('fn2');
      expect(first).toEqual(second);
    });
  });

  describe('findSimilar', () => {
    it('returns results sorted by descending similarity', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      const results = db.findSimilar('fn1');

      expect(results.length).toBeGreaterThan(0);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
    });

    it('excludes the query id from results', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      const results = db.findSimilar('fn1');
      const ids = results.map((r) => r.function.id);
      expect(ids).not.toContain('fn1');
    });

    it('fn3 is most similar to fn1 (shared component)', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      const results = db.findSimilar('fn1');
      expect(results[0].function.id).toBe('fn3');
    });

    it('respects the limit parameter', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      const results = db.findSimilar('fn1', 1);
      expect(results).toHaveLength(1);
    });

    it('returns empty array for unknown id', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      const results = db.findSimilar('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('normalized vectors', () => {
    it('self dot-product is approximately 1.0', () => {
      const db = KappaDb.fromDump(makeDump(), 'arm');
      const vectors = db.vectors;
      for (const [, vec] of vectors) {
        let dot = 0;
        for (const v of vec) {
          dot += v * v;
        }
        expect(dot).toBeCloseTo(1.0, 10);
      }
    });
  });

  describe('empty dump', () => {
    it('handles empty functions and vectors', () => {
      const db = KappaDb.fromDump({ decompFunctions: [], vectors: [] }, 'arm');
      expect(db.functions).toHaveLength(0);
      expect(db.vectors.size).toBe(0);
      expect(db.getStats()).toEqual({
        totalFunctions: 0,
        decompiledFunctions: 0,
        asmOnlyFunctions: 0,
        totalVectors: 0,
        embeddingDimension: 0,
      });
    });
  });

  describe('missing vector edge case', () => {
    it('findSimilar still works when function has no vector', () => {
      const db = KappaDb.fromDump(
        makeDump({
          vectors: [
            { id: 'fn1', embedding: [1, 0, 0] },
            // fn2 and fn3 have no vectors
          ],
        }),
        'arm',
      );
      // fn2 has no vector, should return empty
      const results = db.findSimilar('fn2');
      expect(results).toEqual([]);

      // fn1 has a vector but no other vectors to compare, so empty
      const results2 = db.findSimilar('fn1');
      expect(results2).toEqual([]);
    });
  });
});

describe('KappaDb difficulty tiers', () => {
  function makeFnWithAsm(id: string, instrCount: number, cCode?: string): DecompFunctionDoc {
    // Generate assembly with the given number of instructions
    const lines = [];
    for (let i = 0; i < instrCount; i++) {
      lines.push(`\tmov r${i % 8}, #${i}`);
    }
    return {
      id,
      name: id,
      asmCode: lines.join('\n'),
      asmModulePath: 'asm/test.s',
      callsFunctions: [],
      ...(cCode ? { cCode, cModulePath: 'src/test.c' } : {}),
    };
  }

  it('splits functions into three tiers at tertile boundaries', () => {
    // Create 9 functions with varying complexity: 3 decompiled (small), 6 not (varying size)
    const functions = [
      makeFnWithAsm('a', 2, 'int a() {}'),
      makeFnWithAsm('b', 3, 'int b() {}'),
      makeFnWithAsm('c', 4, 'int c() {}'),
      makeFnWithAsm('d', 10),
      makeFnWithAsm('e', 15),
      makeFnWithAsm('f', 20),
      makeFnWithAsm('g', 30),
      makeFnWithAsm('h', 40),
      makeFnWithAsm('i', 50),
    ];

    const db = KappaDb.fromDump({ decompFunctions: functions, vectors: [] }, 'arm');
    const tiers = db.getDifficultyTiers();

    // Should have all 9 functions assigned a tier
    expect(tiers.tiers.size).toBe(9);

    // Thresholds should be defined
    expect(tiers.thresholds[0]).toBeLessThanOrEqual(tiers.thresholds[1]);

    // Each tier should have at least 1 function (distribution may not be perfectly even)
    let easy = 0;
    let medium = 0;
    let hard = 0;
    for (const tier of tiers.tiers.values()) {
      if (tier === 'easy') {
        easy++;
      }
      if (tier === 'medium') {
        medium++;
      }
      if (tier === 'hard') {
        hard++;
      }
    }
    expect(easy).toBeGreaterThanOrEqual(1);
    expect(medium).toBeGreaterThanOrEqual(1);
    expect(hard).toBeGreaterThanOrEqual(1);
    expect(easy + medium + hard).toBe(9);
  });

  it('getDifficultyScores returns scores for all functions', () => {
    const functions = [makeFnWithAsm('a', 5, 'int a() {}'), makeFnWithAsm('b', 10), makeFnWithAsm('c', 20)];

    const db = KappaDb.fromDump({ decompFunctions: functions, vectors: [] }, 'arm');
    const scores = db.getDifficultyScores();

    expect(scores.size).toBe(3);
    for (const [, ds] of scores) {
      expect(ds.score).toBeGreaterThanOrEqual(0);
      expect(ds.score).toBeLessThanOrEqual(1);
      expect(ds.metrics.instructionCount).toBeGreaterThan(0);
    }
  });

  it('exposes the trained model via difficultyModel', () => {
    const functions = [makeFnWithAsm('a', 5, 'int a() {}'), makeFnWithAsm('b', 10)];

    const db = KappaDb.fromDump({ decompFunctions: functions, vectors: [] }, 'arm');
    const model = db.difficultyModel;

    expect(model.means).toHaveLength(3);
    expect(model.stds).toHaveLength(3);
    expect(model.coefficients).toHaveLength(3);
    expect(typeof model.intercept).toBe('number');
  });
});
