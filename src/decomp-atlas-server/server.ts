import { zValidator } from '@hono/zod-validator';
import fs from 'fs/promises';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { z } from 'zod';

import type { ConfigFile } from '~/shared/config.js';
import { KappaDb, type KappaDbDump } from '~/shared/kappa-db/kappa-db.js';
import { parseMapFile } from '~/shared/map-file/map-file.js';
import { stripTrailingAsmLines } from '~/shared/prompt-builder/craft-prompt.js';
import { createDecompilePrompt } from '~/shared/prompt-builder/prompt-builder.js';
import type { PromptSettings } from '~/shared/prompt-builder/prompt-settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve a function name to an absolute object file path using the symbol map.
 *
 * The map file paths are relative to the linker's working directory, which may
 * differ from the project root. We try the direct path first (works for AF-style
 * projects), then glob under `<projectPath>/build/` for the .o filename (handles
 * SA3-style where the linker runs from a build subdirectory).
 */
async function resolveObjectPath(
  functionName: string,
  projectPath: string,
  symbolMap: Map<string, string>,
): Promise<string | null> {
  const relativePath = symbolMap.get(functionName);
  if (!relativePath) {
    return null;
  }

  // Try direct join (works when map paths are relative to project root)
  const directPath = path.join(projectPath, relativePath);
  try {
    await fs.access(directPath);
    return directPath;
  } catch {
    // Not found at direct path — try globbing under build/
  }

  const fileName = path.basename(relativePath);
  const buildDir = path.join(projectPath, 'build');
  for await (const match of fs.glob(`**/${fileName}`, { cwd: buildDir })) {
    return path.join(buildDir, match);
  }

  return null;
}

export function createAtlasServer({ fileConfig, configPath }: { fileConfig: ConfigFile; configPath: string }) {
  // Cached state after load-project
  let cachedDb: KappaDb | null = null;
  let cachedProjectPath: string | null = null;
  let cachedSymbolMap: Map<string, string> | null = null;

  const platform = fileConfig.global.target;
  const promptsDir = fileConfig.global.promptsDir;

  // Chain API routes for Hono RPC type inference
  const app = new Hono()
    .use('/api/*', cors())
    .post('/api/loadProject', zValidator('json', z.object({ projectPath: z.string() })), async (c) => {
      const { projectPath } = c.req.valid('json');

      const kappaDbPath = path.join(projectPath, 'kappa-db.json');

      let raw: string;
      try {
        raw = await fs.readFile(kappaDbPath, 'utf-8');
      } catch {
        return c.json({ error: `kappa-db.json not found at ${kappaDbPath}` }, 404);
      }

      const dump: KappaDbDump = JSON.parse(raw);
      cachedDb = KappaDb.fromDump(dump, platform);
      cachedProjectPath = projectPath;

      // Parse map file if configured
      const mapFilePath = fileConfig.global.mapFilePath;
      try {
        const mapContent = await fs.readFile(mapFilePath, 'utf-8');
        cachedSymbolMap = parseMapFile(mapContent);
      } catch {
        return c.json({ error: `map file not found at ${mapFilePath}` }, 404);
      }

      return c.json({ data: dump, platform });
    })
    .post('/api/buildPrompt', zValidator('json', z.object({ functionId: z.string() })), async (c) => {
      if (!cachedDb || !cachedProjectPath) {
        return c.json({ error: 'Project not loaded. Call /api/loadProject first.' }, 400);
      }

      const { functionId } = c.req.valid('json');

      try {
        const prompt = await createDecompilePrompt({
          db: cachedDb,
          functionId,
          projectPath: cachedProjectPath,
          platform,
        });

        return c.json({ prompt });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 400);
      }
    })
    .post(
      '/api/savePrompt',
      zValidator(
        'json',
        z.object({
          functionName: z.string(),
          promptContent: z.string(),
          asm: z.string(),
        }),
      ),
      async (c) => {
        const { functionName, promptContent, asm } = c.req.valid('json');

        try {
          const promptDir = path.join(promptsDir, functionName);
          await fs.mkdir(promptDir, { recursive: true });

          const promptPath = path.join(promptDir, 'prompt.md');
          await fs.writeFile(promptPath, promptContent, 'utf-8');

          const targetObjectPath =
            cachedProjectPath && cachedSymbolMap
              ? await resolveObjectPath(functionName, cachedProjectPath, cachedSymbolMap)
              : null;

          const settings: PromptSettings = {
            functionName,
            targetObjectPath: targetObjectPath ?? 'OBJECT_FILE_NOT_FOUND',
            asm: stripTrailingAsmLines(asm),
          };

          const settingsPath = path.join(promptDir, 'settings.yaml');
          await fs.writeFile(settingsPath, YAML.stringify(settings), 'utf-8');

          return c.json({ success: true as const, path: promptDir });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return c.json({ error: message }, 500);
        }
      },
    );

  // Serve built decomp-atlas UI for all other routes (not part of RPC type)
  app.get('*', async (c) => {
    // Look for the built index.html in the decomp-atlas dist directory
    // The dist is relative to the CLI dist, which is at dist/
    const possiblePaths = [
      path.resolve(path.dirname(configPath), 'node_modules/mizuchi/src/ui/decomp-atlas/dist/index.html'),
      path.resolve(__dirname, '../ui/decomp-atlas/dist/index.html'),
      // Development path (when running with tsx)
      path.resolve(__dirname, '../../src/ui/decomp-atlas/dist/index.html'),
    ];

    for (const htmlPath of possiblePaths) {
      try {
        let html = await fs.readFile(htmlPath, 'utf-8');

        // Inject server config into the HTML
        const configScript = `<script>window.__MIZUCHI_CONFIG__ = ${JSON.stringify({
          serverBaseUrl: '',
          projectPath: cachedProjectPath ?? fileConfig.global?.projectPath ?? '',
          target: platform,
        })};</script>`;
        html = html.replace('</head>', `${configScript}\n</head>`);

        return c.html(html);
      } catch {
        continue;
      }
    }

    return c.text('Decomp Atlas UI not built. Run: npm run build:decomp-atlas', 404);
  });

  return app;
}

export type AppType = ReturnType<typeof createAtlasServer>;
