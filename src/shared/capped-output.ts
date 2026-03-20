/**
 * Capped Output
 *
 * Captures streaming text while capping memory usage.
 * Keeps the first and last `limit` bytes; middle content is replaced with
 * a truncation marker showing how many bytes were dropped.
 *
 * Useful for capturing stdout/stderr from long-running subprocesses
 * where only the beginning (setup/errors) and end (final results) matter.
 */
export class CappedOutput {
  #head: string[] = [];
  #tail: string[] = [];
  #headSize = 0;
  #tailSize = 0;
  #totalSize = 0;
  #limit: number;

  constructor(limit = 32 * 1024) {
    this.#limit = limit;
  }

  /** Append a chunk of text. */
  push(text: string): void {
    this.#totalSize += text.length;

    if (this.#headSize < this.#limit) {
      this.#head.push(text);
      this.#headSize += text.length;
      return;
    }

    this.#tail.push(text);
    this.#tailSize += text.length;

    // Keep tail under the limit by dropping old tail chunks
    while (this.#tailSize - this.#tail[0].length >= this.#limit) {
      this.#tailSize -= this.#tail.shift()!.length;
    }
  }

  /** Total bytes pushed (before truncation). */
  get totalSize(): number {
    return this.#totalSize;
  }

  /** True if any content was dropped from the middle. */
  get truncated(): boolean {
    return this.#totalSize > this.#headSize + this.#tailSize;
  }

  /** Produce the final string with a truncation marker if content was dropped. */
  toString(): string {
    const head = this.#head.join('');
    const tail = this.#tail.join('');
    const droppedBytes = this.#totalSize - head.length - tail.length;
    if (droppedBytes <= 0) {
      return head + tail;
    }
    const droppedMB = (droppedBytes / (1024 * 1024)).toFixed(1);
    return head + `\n\n... [truncated ${droppedMB} MB] ...\n\n` + tail;
  }
}
