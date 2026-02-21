export type DecompFunctionDoc = {
  id: string;
  name: string;
  cCode?: string;
  cModulePath?: string;
  asmCode: string;
  asmModulePath: string;
  callsFunctions: string[];
};

export interface KappaDbDump {
  decompFunctions: DecompFunctionDoc[];
  vectors: Array<{ id: string; embedding: number[] }>;
}

export interface KappaDbStats {
  totalFunctions: number;
  decompiledFunctions: number;
  asmOnlyFunctions: number;
  totalVectors: number;
  embeddingDimension: number;
}

export interface SimilarResult {
  function: DecompFunctionDoc;
  similarity: number;
}

export class KappaDb {
  readonly #functions: DecompFunctionDoc[];
  readonly #functionById: Map<string, DecompFunctionDoc>;
  readonly #vectorIds: string[];
  readonly #normalizedVectors: Float64Array;
  readonly #dimension: number;
  #calledByIndex: Map<string, string[]> | null = null;
  #vectorsCache: ReadonlyMap<string, number[]> | null = null;

  /** @internal Use `KappaDb.fromDump()` instead. */
  constructor(functions: DecompFunctionDoc[], vectorIds: string[], normalizedVectors: Float64Array, dimension: number) {
    this.#functions = functions;
    this.#functionById = new Map(functions.map((f) => [f.id, f]));
    this.#vectorIds = vectorIds;
    this.#normalizedVectors = normalizedVectors;
    this.#dimension = dimension;
  }

  static fromDump(data: KappaDbDump): KappaDb {
    const functions = data.decompFunctions;
    const vectorIds: string[] = [];
    const dimension = data.vectors.length > 0 ? data.vectors[0].embedding.length : 0;

    // Flatten all embeddings into a single Float64Array for cache-friendly access,
    // normalizing each vector to unit length so cosine similarity = dot product.
    const normalizedVectors = new Float64Array(data.vectors.length * dimension);

    for (let i = 0; i < data.vectors.length; i++) {
      const vec = data.vectors[i];
      vectorIds.push(vec.id);

      const embedding = vec.embedding;
      let norm = 0;
      for (let j = 0; j < dimension; j++) {
        norm += embedding[j] * embedding[j];
      }
      norm = Math.sqrt(norm);

      const offset = i * dimension;
      if (norm > 0) {
        for (let j = 0; j < dimension; j++) {
          normalizedVectors[offset + j] = embedding[j] / norm;
        }
      }
    }

    return new KappaDb(functions, vectorIds, normalizedVectors, dimension);
  }

  get functions(): ReadonlyArray<DecompFunctionDoc> {
    return this.#functions;
  }

  get vectors(): ReadonlyMap<string, number[]> {
    if (!this.#vectorsCache) {
      const map = new Map<string, number[]>();
      for (let i = 0; i < this.#vectorIds.length; i++) {
        const offset = i * this.#dimension;
        const vec: number[] = [];
        for (let j = 0; j < this.#dimension; j++) {
          vec.push(this.#normalizedVectors[offset + j]);
        }
        map.set(this.#vectorIds[i], vec);
      }
      this.#vectorsCache = map;
    }

    return this.#vectorsCache;
  }

  getFunctionById(id: string): DecompFunctionDoc | undefined {
    return this.#functionById.get(id);
  }

  getCalledBy(id: string): DecompFunctionDoc[] {
    if (!this.#calledByIndex) {
      const index = new Map<string, string[]>();
      for (const fn of this.#functions) {
        for (const calleeId of fn.callsFunctions) {
          let callers = index.get(calleeId);
          if (!callers) {
            callers = [];
            index.set(calleeId, callers);
          }
          callers.push(fn.id);
        }
      }
      this.#calledByIndex = index;
    }

    const callerIds = this.#calledByIndex.get(id) ?? [];
    const result: DecompFunctionDoc[] = [];
    for (const callerId of callerIds) {
      const fn = this.#functionById.get(callerId);
      if (fn) {
        result.push(fn);
      }
    }
    return result;
  }

  getStats(): KappaDbStats {
    let decompiledFunctions = 0;
    for (const fn of this.#functions) {
      if (fn.cCode) {
        decompiledFunctions++;
      }
    }

    return {
      totalFunctions: this.#functions.length,
      decompiledFunctions,
      asmOnlyFunctions: this.#functions.length - decompiledFunctions,
      totalVectors: this.#vectorIds.length,
      embeddingDimension: this.#dimension,
    };
  }

  findSimilar(id: string, limit = 10): SimilarResult[] {
    const queryIndex = this.#vectorIds.indexOf(id);
    if (queryIndex === -1) {
      return [];
    }

    const queryOffset = queryIndex * this.#dimension;
    const results: Array<{ id: string; similarity: number }> = [];

    for (let i = 0; i < this.#vectorIds.length; i++) {
      if (i === queryIndex) {
        continue;
      }

      const offset = i * this.#dimension;
      let dot = 0;
      for (let j = 0; j < this.#dimension; j++) {
        dot += this.#normalizedVectors[queryOffset + j] * this.#normalizedVectors[offset + j];
      }

      results.push({ id: this.#vectorIds[i], similarity: dot });
    }

    results.sort((a, b) => b.similarity - a.similarity);

    const topResults: SimilarResult[] = [];
    for (let i = 0; i < Math.min(limit, results.length); i++) {
      const fn = this.#functionById.get(results[i].id);
      if (fn) {
        topResults.push({ function: fn, similarity: results[i].similarity });
      }
    }

    return topResults;
  }
}
