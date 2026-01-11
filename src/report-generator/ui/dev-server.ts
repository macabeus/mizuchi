/**
 * Development server for the report UI with hot reload.
 * Usage: npx tsx dev-server.ts <path-to-benchmark-result.json>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { type Plugin, createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const jsonPath = process.argv[2];

  if (!jsonPath) {
    console.error('Usage: npx tsx dev-server.ts <path-to-benchmark-result.json>');
    process.exit(1);
  }

  const absoluteJsonPath = path.isAbsolute(jsonPath) ? jsonPath : path.resolve(process.cwd(), jsonPath);

  if (!fs.existsSync(absoluteJsonPath)) {
    console.error(`Error: File not found: ${absoluteJsonPath}`);
    process.exit(1);
  }

  // Read the initial report data
  let reportData = JSON.parse(fs.readFileSync(absoluteJsonPath, 'utf-8'));

  // Watch the JSON file for changes and trigger browser reload
  let server: Awaited<ReturnType<typeof createServer>>;

  fs.watch(absoluteJsonPath, (eventType) => {
    if (eventType === 'change') {
      try {
        reportData = JSON.parse(fs.readFileSync(absoluteJsonPath, 'utf-8'));
        console.log(`\n[dev-server] Report data reloaded from ${path.basename(absoluteJsonPath)}`);
        // Trigger full page reload to pick up new data
        server?.ws.send({ type: 'full-reload' });
      } catch (e) {
        console.error('[dev-server] Failed to reload JSON:', e);
      }
    }
  });

  // Plugin to inject report data into HTML
  const injectReportDataPlugin: Plugin = {
    name: 'inject-report-data',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // Encode as base64 to avoid any HTML parsing issues
        const jsonString = JSON.stringify(reportData);
        const base64Data = Buffer.from(jsonString).toString('base64');
        const script = `<script>
  window.__BENCHMARK_REPORT__ = JSON.parse(atob('${base64Data}'));
</script>`;
        return html.replace('</head>', `${script}</head>`);
      },
    },
  };

  // Create Vite dev server using existing vite.config.ts (which has React plugin)
  // and add our custom plugin for injecting report data
  server = await createServer({
    configFile: path.join(__dirname, 'vite.config.ts'),
    server: {
      port: 3000,
      open: true,
    },
    plugins: [injectReportDataPlugin],
  });

  await server.listen();

  console.log(`\n  Report UI Dev Server`);
  console.log(`  ---------------------`);
  console.log(`  Local:   http://localhost:${server.config.server.port}/`);
  console.log(`  Data:    ${absoluteJsonPath}`);
  console.log(`\n  The server will hot-reload when you modify React components.`);
  console.log(`  The JSON file is also watched for changes.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
