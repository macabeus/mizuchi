import { serve } from '@hono/node-server';
import { Box, Text } from 'ink';
import { option } from 'pastel';
import React, { useEffect, useState } from 'react';
import { z } from 'zod';

import { getConfigFilePath, loadConfigFile } from '~/cli/config.js';
import { createAtlasServer } from '~/decomp-atlas-server/server.js';

export const options = z.object({
  config: z
    .string()
    .optional()
    .describe(option({ description: 'Path to mizuchi.yaml config file', alias: 'c' })),
  port: z
    .number()
    .optional()
    .default(3000)
    .describe(option({ description: 'Server port', alias: 'p' })),
});

type Props = {
  options: z.infer<typeof options>;
};

export default function Atlas({ options: opts }: Props) {
  const [status, setStatus] = useState<'starting' | 'running' | 'error'>('starting');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>('');

  useEffect(() => {
    async function startServer() {
      try {
        const configPath = getConfigFilePath(opts.config);
        const fileConfig = await loadConfigFile(configPath);

        if (!fileConfig) {
          setStatus('error');
          setErrorMessage(`Config file not found: ${configPath}`);
          return;
        }

        const app = createAtlasServer({ fileConfig, configPath });
        const port = opts.port;

        serve({ fetch: app.fetch, port }, () => {
          setServerUrl(`http://localhost:${port}`);
          setStatus('running');
        });
      } catch (error) {
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }

    startServer();
  }, []);

  if (status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {errorMessage}</Text>
      </Box>
    );
  }

  if (status === 'starting') {
    return <Text color="yellow">Starting Decomp Atlas server...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color="green">Decomp Atlas server running at {serverUrl}</Text>
      <Text color="gray">Press Ctrl+C to stop</Text>
    </Box>
  );
}
