/**
 * Report Generator
 *
 * Generates benchmark reports in JSON and HTML formats.
 * The HTML report is a self-contained React application.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import type { BenchmarkReport } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Find the report UI template by checking multiple possible locations
 */
async function findReportTemplate(): Promise<string> {
  // Possible locations for the report UI template:
  // 1. Relative to current file (for running from source with tsx)
  // 2. In src/ directory (for running from compiled dist/)
  const possiblePaths = [
    path.join(__dirname, 'ui', 'dist', 'index.html'),
    path.join(__dirname, '..', '..', 'src', 'report-generator', 'ui', 'dist', 'index.html'),
  ];

  for (const templatePath of possiblePaths) {
    try {
      await fs.access(templatePath);
      return templatePath;
    } catch {
      // Try next path
    }
  }

  throw new Error(
    `Report UI template not found. Searched paths:\n${possiblePaths.join('\n')}\nRun 'npm run build:report-ui' first.`,
  );
}

/**
 * Save benchmark report as JSON
 */
export async function saveJsonReport(report: BenchmarkReport, outputPath: string): Promise<void> {
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}

/**
 * Generate HTML report
 */
export async function generateHtmlReport(report: BenchmarkReport, outputPath: string): Promise<void> {
  // Find the pre-built report template
  const templatePath = await findReportTemplate();

  const template = await fs.readFile(templatePath, 'utf-8');

  // Inject the report data using base64 encoding to avoid HTML parsing issues
  const jsonString = JSON.stringify(report);
  const base64Data = Buffer.from(jsonString).toString('base64');
  const dataScript = `<script>
  window.__BENCHMARK_REPORT__ = JSON.parse(atob('${base64Data}'));
</script>`;
  const html = template.replace('</head>', `${dataScript}</head>`);

  await fs.writeFile(outputPath, html, 'utf-8');
}

export type { BenchmarkReport, ReportSection, ReportPluginResult } from './types.js';
export { transformToReport, type ReportPluginConfigs } from './transform.js';
