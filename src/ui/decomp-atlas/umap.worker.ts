import { UMAP } from 'umap-js';

interface UmapInput {
  embeddings: number[][];
}

interface UmapOutput {
  coordinates: number[][];
}

self.onmessage = (event: MessageEvent<UmapInput>) => {
  const { embeddings } = event.data;

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, Math.max(2, Math.floor(embeddings.length / 10))),
    minDist: 0.1,
  });

  const coordinates = umap.fit(embeddings);

  self.postMessage({ coordinates } satisfies UmapOutput);
};
