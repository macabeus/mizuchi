import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defaultTestPipelineConfig } from '~/shared/test-utils.js';
import type { PipelineResults } from '~/shared/types.js';

import { saveJsonReportAtomic } from './index.js';
import { type ReportPluginConfigs, transformToReport } from './transform.js';
import type { RunReport } from './types.js';

const pluginConfigs: ReportPluginConfigs = {
  claudeRunner: { stallThreshold: 3, ttftTimeoutMs: 180_000, model: 'test-model' },
  compiler: { compilerScript: 'echo test' },
};

function makePipelineResults(resultCount: number): PipelineResults {
  const results = Array.from({ length: resultCount }, (_, i) => ({
    promptPath: `prompt-${i}.md`,
    functionName: `func_${i}`,
    success: i % 2 === 0,
    totalDurationMs: 1000 * (i + 1),
    setupPhase: {
      attemptNumber: 0,
      pluginResults: [],
      success: true,
      durationMs: 100,
      startTimestamp: new Date().toISOString(),
    },
    attempts: [
      {
        attemptNumber: 1,
        pluginResults: [],
        success: i % 2 === 0,
        durationMs: 900,
        startTimestamp: new Date().toISOString(),
      },
    ],
  }));

  return {
    timestamp: new Date().toISOString(),
    config: defaultTestPipelineConfig,
    results,
    summary: {
      totalPrompts: resultCount,
      successfulPrompts: results.filter((r) => r.success).length,
      successRate: resultCount > 0 ? (results.filter((r) => r.success).length / resultCount) * 100 : 0,
      avgAttempts: 1,
      totalDurationMs: results.reduce((sum, r) => sum + r.totalDurationMs, 0),
    },
  };
}

describe('report-generator', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mizuchi-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('transformToReport', () => {
    it('produces a report without partial field when no partial info is provided', () => {
      const pipelineResults = makePipelineResults(3);
      const report = transformToReport(pipelineResults, pluginConfigs);

      expect(report.partial).toBeUndefined();
      expect(report.results).toHaveLength(3);
    });

    it('includes partial metadata when provided', () => {
      const pipelineResults = makePipelineResults(2);
      const report = transformToReport(pipelineResults, pluginConfigs, {
        completedPrompts: 2,
        totalPrompts: 10,
      });

      expect(report.partial).toEqual({ completedPrompts: 2, totalPrompts: 10 });
      expect(report.results).toHaveLength(2);
    });

    it('handles a single completed function in a partial report', () => {
      const pipelineResults = makePipelineResults(1);
      const report = transformToReport(pipelineResults, pluginConfigs, {
        completedPrompts: 1,
        totalPrompts: 30,
      });

      expect(report.partial).toEqual({ completedPrompts: 1, totalPrompts: 30 });
      expect(report.results).toHaveLength(1);
      expect(report.summary.totalPrompts).toBe(1);
    });
  });

  describe('saveJsonReportAtomic', () => {
    it('writes a valid JSON file', async () => {
      const report = transformToReport(makePipelineResults(2), pluginConfigs);
      const outputPath = path.join(tmpDir, 'test-report.json');

      await saveJsonReportAtomic(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      const parsed: RunReport = JSON.parse(content);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.version).toBe(1);
    });

    it('does not leave temp files on success', async () => {
      const report = transformToReport(makePipelineResults(1), pluginConfigs);
      const outputPath = path.join(tmpDir, 'test-report.json');

      await saveJsonReportAtomic(report, outputPath);

      const files = await fs.readdir(tmpDir);
      expect(files).toEqual(['test-report.json']);
    });

    it('overwrites an existing file atomically', async () => {
      const outputPath = path.join(tmpDir, 'test-report.json');

      // Write initial report
      const report1 = transformToReport(makePipelineResults(1), pluginConfigs);
      await saveJsonReportAtomic(report1, outputPath);

      // Overwrite with updated report
      const report2 = transformToReport(makePipelineResults(3), pluginConfigs);
      await saveJsonReportAtomic(report2, outputPath);

      const parsed: RunReport = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
      expect(parsed.results).toHaveLength(3);
    });
  });
});
