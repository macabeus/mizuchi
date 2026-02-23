// Logistic regression for estimating decompilation difficulty.
//
// Trains a binary classifier on each loaded kappa-db dataset using assembly
// metrics (instruction count, branch count, label count) as features. Functions
// that already have C code are labeled 0 (presumably easier), functions without
// are labeled 1 (presumably harder). The model learns per-dataset coefficients
// via gradient descent on binary cross-entropy loss after z-score normalization.
//
// Applying the model to a function's metrics produces a 0-1 score (sigmoid of
// the linear combination), where higher means harder. When the dataset lacks
// both classes, falls back to hardcoded coefficients from Chris Lewis's
// Snowboard Kids 2 analysis.
import { type AsmMetrics, type PlatformTarget, countAsmMetrics } from './asm-metrics';
import type { DecompFunctionDoc } from './kappa-db';

export interface DifficultyModel {
  means: [number, number, number];
  stds: [number, number, number];
  coefficients: [number, number, number];
  intercept: number;
}

export interface DifficultyScore {
  score: number;
  metrics: AsmMetrics;
}

export type DifficultyTier = 'easy' | 'medium' | 'hard';

export interface DifficultyTiers {
  tiers: Map<string, DifficultyTier>;
  thresholds: [number, number];
}

const LEWIS_FALLBACK_MODEL: DifficultyModel = {
  means: [34.27065527065527, 1.6666666666666667, 1.98005698005698],
  stds: [24.763225638334454, 2.047860394102145, 2.3803926026229827],
  coefficients: [2.499706543629367, -0.46648920346754463, 0.4911494991317799],
  intercept: -0.5155412977000488,
};

function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

export function applyDifficultyModel(metrics: AsmMetrics, model: DifficultyModel): number {
  const features = [metrics.instructionCount, metrics.branchCount, metrics.labelCount];
  let logit = model.intercept;
  for (let i = 0; i < 3; i++) {
    const std = model.stds[i];
    const scaled = std > 0 ? (features[i] - model.means[i]) / std : 0;
    logit += scaled * model.coefficients[i];
  }
  return sigmoid(logit);
}

export function trainDifficultyModel(functions: DecompFunctionDoc[], platform: PlatformTarget): DifficultyModel {
  // Need both classes to train
  let hasDecompiled = false;
  let hasUndecompiled = false;
  for (const fn of functions) {
    if (fn.cCode) {
      hasDecompiled = true;
    } else {
      hasUndecompiled = true;
    }
    if (hasDecompiled && hasUndecompiled) {
      break;
    }
  }
  if (!hasDecompiled || !hasUndecompiled) {
    return LEWIS_FALLBACK_MODEL;
  }

  const n = functions.length;
  const allMetrics: AsmMetrics[] = new Array(n);
  const labels = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    allMetrics[i] = countAsmMetrics(functions[i].asmCode, platform);
    labels[i] = functions[i].cCode ? 0 : 1;
  }

  // Compute means and stds (3 features: instructions, branches, labels)
  const means: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const m = allMetrics[i];
    means[0] += m.instructionCount;
    means[1] += m.branchCount;
    means[2] += m.labelCount;
  }
  for (let j = 0; j < 3; j++) {
    means[j] /= n;
  }

  const stds: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const m = allMetrics[i];
    const feats = [m.instructionCount, m.branchCount, m.labelCount];
    for (let j = 0; j < 3; j++) {
      const diff = feats[j] - means[j];
      stds[j] += diff * diff;
    }
  }
  for (let j = 0; j < 3; j++) {
    stds[j] = Math.sqrt(stds[j] / n);
  }

  // Z-score normalize features
  const X = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const m = allMetrics[i];
    const feats = [m.instructionCount, m.branchCount, m.labelCount];
    for (let j = 0; j < 3; j++) {
      X[i * 3 + j] = stds[j] > 0 ? (feats[j] - means[j]) / stds[j] : 0;
    }
  }

  // Gradient descent
  const w = new Float64Array(3);
  let b = 0;
  const lr = 0.1;
  const iterations = 1000;

  for (let iter = 0; iter < iterations; iter++) {
    const gradW = new Float64Array(3);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      let logit = b;
      for (let j = 0; j < 3; j++) {
        logit += X[i * 3 + j] * w[j];
      }
      const pred = sigmoid(logit);
      const error = pred - labels[i];

      for (let j = 0; j < 3; j++) {
        gradW[j] += error * X[i * 3 + j];
      }
      gradB += error;
    }

    for (let j = 0; j < 3; j++) {
      w[j] -= (lr * gradW[j]) / n;
    }
    b -= (lr * gradB) / n;
  }

  return {
    means,
    stds,
    coefficients: [w[0], w[1], w[2]],
    intercept: b,
  };
}
