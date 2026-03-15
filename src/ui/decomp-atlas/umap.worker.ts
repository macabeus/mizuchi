import { UMAP } from 'umap-js';

interface UmapInput {
  embeddings: number[][];
}

interface UmapOutput {
  coordinates: number[][];
}

// Mulberry32: simple seeded 32-bit PRNG for deterministic UMAP output
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

self.onmessage = (event: MessageEvent<UmapInput>) => {
  const { embeddings } = event.data;

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, Math.max(2, Math.floor(embeddings.length / 10))),
    minDist: 0.1,
    random: mulberry32(42),
  });

  const coordinates = umap.fit(embeddings);

  self.postMessage({ coordinates } satisfies UmapOutput);
};
