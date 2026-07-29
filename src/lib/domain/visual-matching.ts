export interface VisualSimilarityResult {
  similarity: number;
  score: number;
  available: boolean;
  reason?: string;
}

export interface CombinedMatchScoreInput {
  textConfidence: number;
  visualScore?: number | null;
  visualAvailable: boolean;
}

/** Cosine similarity for L2-normalized or raw embedding vectors. */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Map cosine similarity [-1, 1] → confidence [0, 100]. */
export function visualSimilarityToScore(similarity: number): number {
  const clamped = Math.max(-1, Math.min(1, similarity));
  return Math.round(((clamped + 1) / 2) * 100);
}

/**
 * Blend text + visual confidence for category-agnostic product matching.
 * When visual is missing, keep text score but do not invent visual agreement.
 */
export function combineTextAndVisualConfidence(input: CombinedMatchScoreInput): number {
  if (!input.visualAvailable || input.visualScore == null) {
    return Math.round(input.textConfidence);
  }
  return Math.round(input.textConfidence * 0.4 + input.visualScore * 0.6);
}

export function meanPoolEmbedding(output: unknown): Float32Array {
  if (output instanceof Float32Array) return output;
  if (Array.isArray(output) && typeof output[0] === "number") {
    return Float32Array.from(output as number[]);
  }

  const tensor = output as { data?: ArrayLike<number>; dims?: number[] } | null;
  if (tensor?.data) {
    const data = Float32Array.from(tensor.data as ArrayLike<number>);
    const dims = tensor.dims ?? [data.length];
    if (dims.length === 1) return data;
    const hidden = dims[dims.length - 1] ?? data.length;
    const tokens = data.length / hidden;
    const pooled = new Float32Array(hidden);
    for (let t = 0; t < tokens; t++) {
      for (let h = 0; h < hidden; h++) {
        pooled[h] += data[t * hidden + h] ?? 0;
      }
    }
    for (let h = 0; h < hidden; h++) pooled[h] /= tokens;
    return pooled;
  }

  if (Array.isArray(output) && Array.isArray(output[0])) {
    const rows = output as number[][];
    const hidden = rows[0]?.length ?? 0;
    const pooled = new Float32Array(hidden);
    for (const row of rows) {
      for (let h = 0; h < hidden; h++) pooled[h] += row[h] ?? 0;
    }
    for (let h = 0; h < hidden; h++) pooled[h] /= rows.length || 1;
    return pooled;
  }

  return new Float32Array(0);
}

export const DEFAULT_VISUAL_MATCH_FLOOR = 55;
