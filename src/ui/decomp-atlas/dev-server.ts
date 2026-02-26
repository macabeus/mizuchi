/**
 * Development server for the Decomp Atlas UI with hot reload.
 * Starts both the Vite dev server (with HMR) and the Atlas API backend.
 *
 * Usage: npx tsx src/ui/decomp-atlas/dev-server.ts [-c path/to/mizuchi.yaml]
 */
import { serve } from '@hono/node-server';
import path from 'path';
import { fileURLToPath } from 'url';
import { type Plugin, createServer } from 'vite';

import { getConfigFilePath, loadConfigFile } from '~/cli/config.js';
import { createAtlasServer } from '~/decomp-atlas-server/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Parse -c / --config flag
  const args = process.argv.slice(2);
  let configArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-c' || args[i] === '--config') && args[i + 1]) {
      configArg = args[i + 1];
      break;
    }
  }

  const configPath = getConfigFilePath(configArg);
  const fileConfig = await loadConfigFile(configPath);

  if (!fileConfig) {
    console.error(`Error: Config file not found: ${configPath}`);
    process.exit(1);
  }

  const platform = fileConfig.global?.target ?? 'gba';
  const projectPath = fileConfig.global?.projectPath ?? '';

  // Start the Atlas API backend on port 3000
  const atlasApp = createAtlasServer({ fileConfig, configPath });
  const apiPort = 3000;

  await new Promise<void>((resolve) => {
    serve({ fetch: atlasApp.fetch, port: apiPort }, () => resolve());
  });

  // Vite plugin to inject window.__MIZUCHI_CONFIG__ into the HTML
  const injectConfigPlugin: Plugin = {
    name: 'inject-mizuchi-config',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const config = JSON.stringify({
          serverBaseUrl: '',
          projectPath,
          target: platform,
        });
        const script = `<script>window.__MIZUCHI_CONFIG__ = ${config};</script>`;
        return html.replace('</head>', `${script}\n</head>`);
      },
    },
  };

  // Create Vite dev server using existing vite.config.ts (which has React plugin + proxy)
  const server = await createServer({
    configFile: path.join(__dirname, 'vite.config.ts'),
    plugins: [injectConfigPlugin],
  });

  await server.listen();

  const vitePort = server.config.server.port;
  console.log(`\n  Decomp Atlas Dev Server`);
  console.log(`  -----------------------`);
  console.log(`  UI:       http://localhost:${vitePort}/`);
  console.log(`  API:      http://localhost:${apiPort}/ (proxied via /api)`);
  console.log(`  Config:   ${configPath}`);
  console.log(`  Project:  ${projectPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
