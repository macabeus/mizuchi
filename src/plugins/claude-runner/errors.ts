/**
 * Custom error types for the Claude Runner plugin.
 */

/**
 * Thrown when a query exceeds its timeout budget.
 * Carries the timeout duration so callers can distinguish
 * soft-timeout from hard-timeout without string matching.
 */
export class QueryTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly mode: 'soft' | 'hard';

  constructor({ timeoutMs, mode }: { timeoutMs: number; mode: 'soft' | 'hard' }) {
    super(`Claude timed out after ${timeoutMs}ms (${mode})`);
    this.name = 'QueryTimeoutError';
    this.timeoutMs = timeoutMs;
    this.mode = mode;
  }
}

/**
 * Thrown when no API response arrives within the connect timeout window.
 */
export class QueryConnectTimeoutError extends Error {
  readonly connectTimeoutMs: number;

  constructor({ connectTimeoutMs }: { connectTimeoutMs: number }) {
    super(`Claude connect timeout: no API response within ${connectTimeoutMs}ms`);
    this.name = 'QueryConnectTimeoutError';
    this.connectTimeoutMs = connectTimeoutMs;
  }
}

/**
 * Thrown when a query is aborted by an external signal
 * (e.g., background plugin found a perfect match).
 */
export class QueryAbortedError extends Error {
  constructor() {
    super('Aborted: background plugin found a perfect match');
    this.name = 'QueryAbortedError';
  }
}
