import { describe, expect, it } from 'vitest';

import { isSdkTransportError } from './sdk-error-handlers.js';

describe('isSdkTransportError', () => {
  it('returns true for ProcessTransport not ready error', () => {
    const error = new Error('ProcessTransport is not ready for writing');
    expect(isSdkTransportError(error)).toBe(true);
  });

  it('returns true for EPIPE error', () => {
    const error = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
      errno: -32,
      syscall: 'write',
    });
    expect(isSdkTransportError(error)).toBe(true);
  });

  it('returns false for non-Error values', () => {
    expect(isSdkTransportError('string error')).toBe(false);
    expect(isSdkTransportError(42)).toBe(false);
    expect(isSdkTransportError(null)).toBe(false);
    expect(isSdkTransportError(undefined)).toBe(false);
  });

  it('returns false for unrelated Error', () => {
    expect(isSdkTransportError(new Error('Something else'))).toBe(false);
  });

  it('returns false for non-EPIPE errno errors', () => {
    const error = Object.assign(new Error('write ECONNRESET'), {
      code: 'ECONNRESET',
      errno: -54,
      syscall: 'write',
    });
    expect(isSdkTransportError(error)).toBe(false);
  });

  it('returns true for EPIPE regardless of message text', () => {
    const error = Object.assign(new Error('some other message'), {
      code: 'EPIPE',
    });
    expect(isSdkTransportError(error)).toBe(true);
  });
});
