/**
 * Custom error types for pipeline control flow.
 */

/**
 * Thrown when the API plan usage limit or billing limit is reached.
 * Contains the error message from the SDK which may include reset time info.
 */
export class UsageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageLimitError';
  }
}

/**
 * Thrown when the user chooses to abort the pipeline (e.g., after a usage limit prompt).
 * Propagates through PluginManager to trigger graceful shutdown with partial results.
 */
export class PipelineAbortError extends Error {
  constructor(message: string = 'Pipeline aborted by user') {
    super(message);
    this.name = 'PipelineAbortError';
  }
}
