import { cosineSimilarity, meanPoolEmbedding, visualSimilarityToScore } from "@/lib/domain/visual-matching";
import { loadTransformers } from "./load-transformers";
import type { VisualMatchComparison, VisualMatchProvider } from "./visual-match";

type FeatureExtractor = (input: string | Uint8Array, options?: { pooling?: string; normalize?: boolean }) => Promise<unknown>;

const DEFAULT_MODEL = "Xenova/dinov2-small";

/**
 * Category-agnostic visual product matching via DINOv2 embeddings.
 * Free/Apache-2.0 model weights; runs locally through Transformers.js.
 */
export class Dinov2VisualMatchProvider implements VisualMatchProvider {
  readonly name = "Dinov2VisualMatchProvider";
  private extractor: FeatureExtractor | null = null;
  private readonly cache = new Map<string, Float32Array>();
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly config: {
      modelId?: string;
      enabled?: boolean;
    } = {},
  ) {}

  private get enabled() {
    if (this.config.enabled != null) return this.config.enabled;
    return process.env.VISUAL_MATCH_ENABLED !== "false";
  }

  private get modelId() {
    return this.config.modelId ?? process.env.VISUAL_MATCH_MODEL ?? DEFAULT_MODEL;
  }

  async compareImages(sourceImageUrl: string, candidateImageUrl: string): Promise<VisualMatchComparison> {
    if (!this.enabled) {
      return {
        similarity: 0,
        score: 0,
        available: false,
        reason: "visual_match_disabled",
        model: this.modelId,
      };
    }
    if (!sourceImageUrl || !candidateImageUrl) {
      return {
        similarity: 0,
        score: 0,
        available: false,
        reason: "missing_image_url",
        model: this.modelId,
      };
    }

    try {
      const [source, candidate] = await Promise.all([this.embedImage(sourceImageUrl), this.embedImage(candidateImageUrl)]);
      if (!source || !candidate) {
        return {
          similarity: 0,
          score: 0,
          available: false,
          reason: "embedding_failed",
          model: this.modelId,
        };
      }

      const similarity = cosineSimilarity(source, candidate);
      return {
        similarity,
        score: visualSimilarityToScore(similarity),
        available: true,
        model: this.modelId,
      };
    } catch (error) {
      return {
        similarity: 0,
        score: 0,
        available: false,
        reason: error instanceof Error ? error.message : String(error),
        model: this.modelId,
      };
    }
  }

  async embedImage(imageUrl: string): Promise<Float32Array | null> {
    const cached = this.cache.get(imageUrl);
    if (cached) return cached;

    await this.ensureExtractor();
    if (!this.extractor) return null;

    const bytes = await this.fetchImageBytes(imageUrl);
    if (!bytes) return null;

    const output = await this.extractor(bytes, { pooling: "mean", normalize: true });
    const embedding = meanPoolEmbedding(output as never);
    if (embedding.length === 0) return null;

    this.cache.set(imageUrl, embedding);
    return embedding;
  }

  private async ensureExtractor() {
    if (this.extractor) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const { pipeline, env } = await loadTransformers();
      env.allowLocalModels = false;
      // Prefer WASM on environments without a native onnxruntime-node binary.
      this.extractor = (await pipeline("image-feature-extraction", this.modelId, {
        // Node path registers cpu/webgpu/coreml; onnxruntime-web backs "cpu" via WASM here.
        device: "cpu",
        dtype: "fp32",
      })) as FeatureExtractor;
    })();

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  private async fetchImageBytes(imageUrl: string): Promise<Uint8Array | null> {
    try {
      const res = await fetch(imageUrl, {
        headers: { "User-Agent": "ebay-automation-visual-match/0.1" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
}
