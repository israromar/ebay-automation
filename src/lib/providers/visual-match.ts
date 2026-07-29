export interface VisualMatchComparison {
  similarity: number;
  score: number;
  available: boolean;
  reason?: string;
  model: string;
}

export interface VisualMatchProvider {
  readonly name: string;
  compareImages(sourceImageUrl: string, candidateImageUrl: string): Promise<VisualMatchComparison>;
  embedImage?(imageUrl: string): Promise<Float32Array | null>;
}
