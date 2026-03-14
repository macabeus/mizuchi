import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { option } from 'pastel';
import React, { useEffect, useState } from 'react';
import { z } from 'zod';

export const options = z.object({
  rom: z.string().describe(option({ description: 'Path to GBA ROM file' })),
  script: z
    .string()
    .optional()
    .describe(option({ description: 'Path to JavaScript script file', alias: 's' })),
  scriptInline: z
    .string()
    .optional()
    .describe(option({ description: 'Inline JavaScript to execute', alias: 'i' })),
  output: z
    .string()
    .optional()
    .describe(option({ description: 'Output directory for generated files', alias: 'o' })),
  loadSave: z
    .string()
    .optional()
    .describe(option({ description: 'Path to save state to load before script' })),
  bios: z
    .string()
    .optional()
    .describe(option({ description: 'Path to GBA BIOS (optional, HLE stubs used if omitted)' })),
});

type Props = {
  options: z.infer<typeof options>;
};

interface RunState {
  phase: 'loading' | 'running' | 'complete' | 'error';
  romSize?: string;
  scriptSource?: string;
  generatedFiles?: string[];
  actionsExecuted?: number;
  outputDir?: string;
  errorMessage?: string;
  logLines: string[];
}

export default function Sgba({ options: opts }: Props) {
  const [state, setState] = useState<RunState>({
    phase: 'loading',
    logLines: [],
  });

  useEffect(() => {
    runSgba(opts, setState);
  }, [opts]);

  return (
    <Box flexDirection="column" padding={1}>
      {state.phase === 'loading' && (
        <Text color="yellow">
          <Spinner type="dots" /> Loading ROM...
        </Text>
      )}

      {state.phase === 'running' && (
        <Box flexDirection="column">
          <Text color="green">
            + Loaded ROM: {opts.rom} ({state.romSize})
          </Text>
          <Text color="yellow">
            <Spinner type="dots" /> Executing script...
          </Text>
          {state.logLines.length > 0 && (
            <Box flexDirection="column" marginLeft={2} marginTop={1}>
              {state.logLines.slice(-5).map((line, i) => (
                <Text key={i} dimColor>
                  {line}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      {state.phase === 'complete' && (
        <Box flexDirection="column">
          <Text color="green">
            + Loaded ROM: {opts.rom} ({state.romSize})
          </Text>
          <Text color="green">
            + Executed {state.actionsExecuted} actions from {state.scriptSource}
          </Text>

          {state.generatedFiles && state.generatedFiles.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Generated files:</Text>
              {state.generatedFiles.map((file) => (
                <Text key={file} dimColor>
                  {'  '}
                  {file}
                </Text>
              ))}
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>Output: {state.outputDir}</Text>
          </Box>
        </Box>
      )}

      {state.phase === 'error' && (
        <Box flexDirection="column">
          <Text color="red" bold>
            Error
          </Text>
          <Text color="red">{state.errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
}

async function runSgba(
  opts: z.infer<typeof options>,
  setState: React.Dispatch<React.SetStateAction<RunState>>,
): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    // Validate inputs
    if (!opts.script && !opts.scriptInline) {
      throw new Error('Either --script or --script-inline must be provided');
    }

    // Determine output directory
    const outputDir = opts.output ?? path.join(os.tmpdir(), `sgba-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    // Read script
    let scriptCode: string;
    let scriptSource: string;
    if (opts.script) {
      scriptCode = await fs.readFile(opts.script, 'utf-8');
      scriptSource = `"${opts.script}"`;
    } else {
      scriptCode = opts.scriptInline!;
      scriptSource = 'inline script';
    }

    // Get ROM size for display
    const romStats = await fs.stat(opts.rom);
    const romSize = formatSize(romStats.size);

    setState((prev) => ({
      ...prev,
      phase: 'running',
      romSize,
      scriptSource,
      outputDir,
    }));

    // Create headless runtime
    const { HeadlessRuntime } = await import('@sgba/gba-node');

    const runtime = await HeadlessRuntime.create({
      romPath: opts.rom,
      biosPath: opts.bios,
      loadSavePath: opts.loadSave,
      outputDir,
      logFn: (message: string) => {
        setState((prev) => ({
          ...prev,
          logLines: [...prev.logLines, message],
        }));
      },
    });

    // Execute script
    await runtime.executeScript(scriptCode, opts.script);

    // Write final save state
    await runtime.writeFinalSaveState();

    // Get generated files list
    const { NodeScriptingHost } = await import('@sgba/gba-node');
    const host = runtime.host as InstanceType<typeof NodeScriptingHost>;
    const generatedFiles = [...host.generatedFiles, 'final_save.json'];

    setState({
      phase: 'complete',
      romSize,
      scriptSource,
      generatedFiles,
      actionsExecuted: runtime.engine.actionsExecuted,
      outputDir,
      logLines: [],
    });

    setTimeout(() => {
      process.exit(0);
    }, 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState((prev) => ({
      ...prev,
      phase: 'error',
      errorMessage: message,
    }));

    setTimeout(() => {
      process.exit(1);
    }, 1);
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}
