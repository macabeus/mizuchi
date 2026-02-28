/**
 * SDK Error Handlers
 *
 * Installs global error handlers that swallow expected EPIPE errors from the
 * Claude Agent SDK. These errors occur when query.close() kills the SDK's
 * internal subprocess while it still has in-flight writes to the stdio pipe.
 *
 * Two surfaces exist:
 * 1. `unhandledRejection` — the SDK's ProcessTransport rejects a write promise
 * 2. `uncaughtException` — an unhandled 'error' event on the subprocess Socket
 *
 * See https://github.com/anthropics/claude-agent-sdk-typescript/issues/148
 */

/**
 * Returns true if the error is a known benign SDK transport error
 * that should be silently swallowed rather than crashing the process.
 */
export function isSdkTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // SDK calls handleControlRequest (without await) which tries to
  // write to a closed ProcessTransport.
  if (error.message === 'ProcessTransport is not ready for writing') {
    return true;
  }

  // EPIPE: the SDK wrote to the subprocess pipe after close() killed it.
  if ('code' in error && (error as NodeJS.ErrnoException).code === 'EPIPE') {
    return true;
  }

  return false;
}

/**
 * Install global process error handlers that swallow known SDK transport
 * errors while preserving default crash behavior for everything else.
 *
 * Should be called once at startup before any SDK queries are created.
 */
export function installSdkErrorHandlers(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    if (isSdkTransportError(reason)) {
      return;
    }
    // Preserve default crash behavior for any other unhandled rejection
    // (throw inside this handler triggers uncaughtException → process exits)
    throw reason;
  });

  // Catch EPIPE that surfaces as an uncaught 'error' event on the SDK's
  // internal Socket (stdio pipe to the Claude Code subprocess).
  // When query.close() kills the subprocess (e.g., on soft timeout or
  // background permuter abort), in-flight writes to the pipe can emit an
  // 'error' event with code EPIPE. Without a listener, Node.js treats
  // this as a fatal uncaught exception and crashes the entire process.
  process.on('uncaughtException', (error: Error) => {
    if (isSdkTransportError(error)) {
      return;
    }
    // Adding an uncaughtException listener suppresses Node.js's default
    // crash behavior, so we must reproduce it for non-EPIPE errors.
    console.error(error);
    process.exit(1);
  });
}
