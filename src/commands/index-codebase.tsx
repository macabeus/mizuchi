import { Box, Static, Text } from 'ink';
import Spinner from 'ink-spinner';
import { option } from 'pastel';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { getConfigFilePath, loadConfigFile } from '~/cli/config.js';
import { objdiffConfigSchema } from '~/plugins/objdiff/objdiff-plugin.js';
import { getPluginConfig } from '~/shared/config.js';
import {
  Embedder,
  type IndexProgress,
  type IndexResult,
  indexCodebase,
  preprocessForEmbedding,
  writeMizuchiDb,
} from '~/shared/indexer/index.js';

export const options = z.object({
  config: z
    .string()
    .optional()
    .describe(option({ description: 'Path to mizuchi.yaml config file', alias: 'c' })),
  skipEmbeddings: z
    .boolean()
    .optional()
    .default(false)
    .describe(option({ description: 'Skip embedding generation', alias: 's' })),
});

type Props = {
  options: z.infer<typeof options>;
};

type Phase = 'loading' | 'indexing' | 'embedding' | 'writing' | 'done' | 'error';

function formatEta(progress: { current: number; total: number; startedAt: number | null }): string {
  if (!progress.startedAt || progress.current < 2) {
    return '';
  }

  const elapsed = Date.now() - progress.startedAt;
  const rate = progress.current / elapsed;
  const remaining = progress.total - progress.current;
  const etaMs = remaining / rate;

  const etaSec = Math.round(etaMs / 1000);
  if (etaSec < 60) {
    return ` — ${etaSec}s remaining`;
  }
  const min = Math.floor(etaSec / 60);
  const sec = etaSec % 60;
  return ` — ${min}m${sec > 0 ? ` ${sec}s` : ''} remaining`;
}

export default function IndexCodebase({ options: opts }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [result, setResult] = useState<IndexResult | null>(null);
  const [embeddingProgress, setEmbeddingProgress] = useState<{
    current: number;
    total: number;
    startedAt: number | null;
  } | null>(null);
  const [logLines, setLogLines] = useState<Array<{ id: number; text: string }>>([]);
  const logIdRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [projectPath, setProjectPath] = useState<string>('');
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    async function run() {
      try {
        // Load config
        const configPath = getConfigFilePath(opts.config);
        const fileConfig = await loadConfigFile(configPath);

        if (!fileConfig) {
          setPhase('error');
          setErrorMessage(`Config file not found: ${configPath}`);
          return;
        }

        const config = fileConfig.global;
        setProjectPath(config.projectPath);
        setPlatform(config.target);

        // Get objdiff diffSettings from plugin config
        const objdiffConfig = getPluginConfig(fileConfig, 'objdiff', objdiffConfigSchema);
        const objdiffDiffSettings = objdiffConfig.diffSettings;

        // Phase 1-3: Index codebase
        setPhase('indexing');
        const indexResult = await indexCodebase({
          config,
          objdiffDiffSettings,
          onProgress: (p) => setProgress(p),
        });
        setResult(indexResult);

        // Phase 4: Compute embeddings (unless skipped)
        if (!opts.skipEmbeddings) {
          const functionsNeedingEmbedding = indexResult.dump.decompFunctions.filter((fn) => {
            const existingVector = indexResult.dump.vectors.find((v) => v.id === fn.id);
            return !existingVector;
          });

          if (functionsNeedingEmbedding.length > 0) {
            setPhase('embedding');
            setEmbeddingProgress({ current: 0, total: functionsNeedingEmbedding.length, startedAt: null });

            const embedder = new Embedder();
            try {
              await embedder.start((msg) => {
                const id = ++logIdRef.current;
                setLogLines((prev) => [...prev, { id, text: msg }]);
              });

              const texts = functionsNeedingEmbedding.map((fn) => preprocessForEmbedding(config.target, fn.asmCode));

              const embeddings = await embedder.embedAll(texts, (current, total) => {
                setEmbeddingProgress((prev) => ({
                  current,
                  total,
                  startedAt: prev?.startedAt ?? Date.now(),
                }));
              });

              for (let i = 0; i < functionsNeedingEmbedding.length; i++) {
                indexResult.dump.vectors.push({
                  id: functionsNeedingEmbedding[i].id,
                  embedding: embeddings[i],
                });
              }
            } finally {
              await embedder.stop();
            }
          }
        }

        // Phase 5: Write database
        setPhase('writing');
        await writeMizuchiDb(config.projectPath, indexResult.dump);

        setPhase('done');
      } catch (error) {
        setPhase('error');
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }

    run();
  }, []);

  if (phase === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {errorMessage}</Text>
      </Box>
    );
  }

  if (phase === 'done' && result) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="green" bold>
          Done! mizuchi-db.json written to {projectPath}/mizuchi-db.json
        </Text>
        <Box flexDirection="column">
          <Text>
            Total: {result.dump.decompFunctions.length} | Matched: {result.stats.matchedFunctions} | Unmatched:{' '}
            {result.stats.unmatchedFunctions}
          </Text>
          <Text>
            New: {result.stats.newCount} | Updated: {result.stats.updatedCount} | Unchanged:{' '}
            {result.stats.unchangedCount} | Removed: {result.stats.removedCount}
          </Text>
          <Text>Embeddings: {result.dump.vectors.length}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Mizuchi - Index Codebase</Text>
      {projectPath && (
        <Box flexDirection="column">
          <Text>Project: {projectPath}</Text>
          <Text>Platform: {platform}</Text>
        </Box>
      )}

      {phase === 'loading' && (
        <Text>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          {' Loading configuration...'}
        </Text>
      )}

      {phase === 'indexing' && progress && (
        <Text>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          {` [${progress.phase}] ${progress.message}`}
        </Text>
      )}

      {phase === 'embedding' && (
        <Box flexDirection="column">
          <Static items={logLines}>
            {(line) => (
              <Text key={line.id} color="gray">
                {line.text}
              </Text>
            )}
          </Static>
          <Text>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            {embeddingProgress
              ? ` Computing embeddings: ${embeddingProgress.current}/${embeddingProgress.total}${formatEta(embeddingProgress)}`
              : ' Starting embedding server...'}
          </Text>
        </Box>
      )}

      {phase === 'writing' && (
        <Text>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          {' Writing mizuchi-db.json...'}
        </Text>
      )}
    </Box>
  );
}
