import { describe, expect, it } from 'vitest';

import type { DecompFunctionDoc } from './kappa-db';
import { type DifficultyModel, applyDifficultyModel, trainDifficultyModel } from './logistic-regression';

function makeFn(id: string, asmCode: string, cCode?: string): DecompFunctionDoc {
  return {
    id,
    name: id,
    asmCode,
    asmModulePath: 'asm/test.s',
    callsFunctions: [],
    ...(cCode ? { cCode, cModulePath: 'src/test.c' } : {}),
  };
}

describe('applyDifficultyModel', () => {
  const lewisModel: DifficultyModel = {
    means: [34.27065527065527, 1.6666666666666667, 1.98005698005698],
    stds: [24.763225638334454, 2.047860394102145, 2.3803926026229827],
    coefficients: [2.499706543629367, -0.46648920346754463, 0.4911494991317799],
    intercept: -0.5155412977000488,
  };

  it('produces a valid 0-1 score for zero metrics', () => {
    const score = applyDifficultyModel({ instructionCount: 0, branchCount: 0, labelCount: 0 }, lewisModel);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(Number.isNaN(score)).toBe(false);
  });

  it('produces a score near 1.0 for large metrics', () => {
    const score = applyDifficultyModel({ instructionCount: 500, branchCount: 50, labelCount: 40 }, lewisModel);
    expect(score).toBeGreaterThan(0.9);
  });

  it('produces a low score for small/easy-looking metrics', () => {
    const score = applyDifficultyModel({ instructionCount: 5, branchCount: 0, labelCount: 0 }, lewisModel);
    expect(score).toBeLessThan(0.3);
  });
});

describe('trainDifficultyModel', () => {
  it('learns coefficients with correct sign from synthetic data', () => {
    // Small functions = decompiled (easy), large functions = not decompiled (hard)
    const functions: DecompFunctionDoc[] = [
      makeFn('e1', 'mov r0, #1\nbx lr', 'int e1() { return 1; }'),
      makeFn('e2', 'mov r0, #2\nbx lr', 'int e2() { return 2; }'),
      makeFn('e3', 'push {lr}\nmov r0, #3\npop {r0}\nbx r0', 'int e3() { return 3; }'),
      makeFn(
        'h1',
        'push {r4, lr}\nmov r0, #1\ncmp r0, #0\nbeq .L0\nmov r1, #2\nbl sub1\n.L0:\nmov r2, #3\ncmp r2, #4\nbne .L1\nmov r3, #5\nbl sub2\n.L1:\npop {r4}\npop {r0}\nbx r0',
      ),
      makeFn(
        'h2',
        'push {r4, r5, lr}\nmov r0, #1\ncmp r0, #0\nbeq .L0\nmov r1, #2\nbl sub1\n.L0:\nmov r2, #3\ncmp r2, #4\nbne .L1\nmov r3, #5\nbl sub2\nmov r4, #6\nbl sub3\n.L1:\npop {r4, r5}\npop {r0}\nbx r0',
      ),
      makeFn(
        'h3',
        'push {r4, r5, r6, lr}\nmov r0, #10\ncmp r0, #0\nbgt .L0\nmov r1, #20\nbl sub1\n.L0:\nmov r2, #30\ncmp r2, #0\nblt .L1\nmov r3, #40\nbl sub2\nmov r4, #50\nbl sub3\nmov r5, #60\nbl sub4\n.L1:\npop {r4, r5, r6}\npop {r0}\nbx r0',
      ),
    ];

    const model = trainDifficultyModel(functions, 'arm');

    // Instructions coefficient should be positive (more instructions → harder)
    expect(model.coefficients[0]).toBeGreaterThan(0);
    // Means and stds should be computed (not fallback)
    expect(model.means[0]).not.toBeCloseTo(34.27, 0); // not Lewis's constants
  });

  it('falls back to Lewis model when no decompiled functions', () => {
    const functions: DecompFunctionDoc[] = [makeFn('h1', 'mov r0, #1\nbx lr'), makeFn('h2', 'mov r0, #2\nbx lr')];

    const model = trainDifficultyModel(functions, 'arm');
    expect(model.intercept).toBeCloseTo(-0.5155412977000488);
  });

  it('falls back to Lewis model when all functions are decompiled', () => {
    const functions: DecompFunctionDoc[] = [
      makeFn('e1', 'mov r0, #1\nbx lr', 'int e1() {}'),
      makeFn('e2', 'mov r0, #2\nbx lr', 'int e2() {}'),
    ];

    const model = trainDifficultyModel(functions, 'arm');
    expect(model.intercept).toBeCloseTo(-0.5155412977000488);
  });

  it('computes means and stds correctly from the dataset', () => {
    const functions: DecompFunctionDoc[] = [
      makeFn('a', 'mov r0, #1\nmov r1, #2', 'int a() {}'), // 2 instructions
      makeFn('b', 'mov r0, #1\nmov r1, #2\nmov r2, #3\nmov r3, #4'), // 4 instructions
    ];

    const model = trainDifficultyModel(functions, 'arm');
    // Mean instructions should be 3 (average of 2 and 4)
    expect(model.means[0]).toBeCloseTo(3, 5);
    // Std should be 1 (population std of [2, 4])
    expect(model.stds[0]).toBeCloseTo(1, 5);
  });
});
