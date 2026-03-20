import { describe, expect, it } from 'vitest';

import { CappedOutput } from '~/shared/capped-output.js';

describe('CappedOutput', () => {
  it('returns all content when under the limit', () => {
    const cap = new CappedOutput(100);
    cap.push('hello ');
    cap.push('world');
    expect(cap.toString()).toBe('hello world');
    expect(cap.truncated).toBe(false);
    expect(cap.totalSize).toBe(11);
  });

  it('returns a single push unchanged when under the limit', () => {
    const cap = new CappedOutput(1024);
    cap.push('short string');
    expect(cap.toString()).toBe('short string');
    expect(cap.truncated).toBe(false);
  });

  it('truncates middle content when over the limit', () => {
    const cap = new CappedOutput(10);
    cap.push('AAAAAAAAAA'); // 10 bytes → fills head
    cap.push('BBBBBBBBBB'); // 10 bytes → middle (will be dropped)
    cap.push('CCCCCCCCCC'); // 10 bytes → tail

    const result = cap.toString();
    expect(result).toContain('AAAAAAAAAA');
    expect(result).toContain('CCCCCCCCCC');
    expect(result).not.toContain('BBBBBBBBBB');
    expect(result).toContain('truncated');
    expect(cap.truncated).toBe(true);
    expect(cap.totalSize).toBe(30);
  });

  it('keeps head and tail within limits', () => {
    const limit = 20;
    const cap = new CappedOutput(limit);

    // Push 100 chunks of 10 bytes each (1000 bytes total)
    for (let i = 0; i < 100; i++) {
      cap.push(`chunk${String(i).padStart(3, '0')}_`);
    }

    const result = cap.toString();
    // Head should start with the first chunk
    expect(result.startsWith('chunk000_')).toBe(true);
    // Tail should end with the last chunk
    expect(result.endsWith('chunk099_')).toBe(true);
    // Should have truncation marker
    expect(result).toContain('truncated');
    expect(cap.truncated).toBe(true);
    expect(cap.totalSize).toBe(900);
  });

  it('shows dropped size in MB in the truncation marker', () => {
    const cap = new CappedOutput(5);
    cap.push('HEAD_');
    // Push ~1 MB of data
    const bigChunk = 'x'.repeat(1024 * 1024);
    cap.push(bigChunk);
    cap.push('_TAIL');

    const result = cap.toString();
    expect(result).toContain('1.0 MB');
    expect(result.startsWith('HEAD_')).toBe(true);
    expect(result.endsWith('_TAIL')).toBe(true);
  });

  it('handles empty input', () => {
    const cap = new CappedOutput(100);
    expect(cap.toString()).toBe('');
    expect(cap.truncated).toBe(false);
    expect(cap.totalSize).toBe(0);
  });

  it('handles a single push that exactly fills the limit', () => {
    const cap = new CappedOutput(10);
    cap.push('0123456789');
    expect(cap.toString()).toBe('0123456789');
    expect(cap.truncated).toBe(false);
  });

  it('handles a single push that exceeds the limit (goes to head only)', () => {
    const cap = new CappedOutput(5);
    cap.push('0123456789');
    // Single push always goes to head, even if over limit
    expect(cap.toString()).toBe('0123456789');
    expect(cap.truncated).toBe(false);
  });

  it('uses 32 KB default limit', () => {
    const cap = new CappedOutput();
    // Fill head with 32 KB
    cap.push('A'.repeat(32 * 1024));
    // Push more data
    cap.push('B'.repeat(100 * 1024));
    cap.push('C'.repeat(32 * 1024));

    expect(cap.truncated).toBe(true);
    const result = cap.toString();
    expect(result.startsWith('A')).toBe(true);
    expect(result.endsWith('C')).toBe(true);
    expect(result).toContain('truncated');
  });

  it('preserves content when total equals exactly 2x limit', () => {
    const cap = new CappedOutput(10);
    cap.push('AAAAAAAAAA'); // 10 bytes → head
    cap.push('BBBBBBBBBB'); // 10 bytes → tail (exactly at limit)
    // No truncation since head (10) + tail (10) = total (20)
    expect(cap.toString()).toBe('AAAAAAAAAABBBBBBBBBB');
    expect(cap.truncated).toBe(false);
  });

  it('tracks totalSize across many pushes', () => {
    const cap = new CappedOutput(10);
    for (let i = 0; i < 1000; i++) {
      cap.push('x');
    }
    expect(cap.totalSize).toBe(1000);
  });
});
