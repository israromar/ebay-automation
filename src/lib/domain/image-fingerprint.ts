import sharp from "sharp";

/**
 * Free, model-less image matching for eBay ↔ AliExpress product photos.
 *
 * Dropshipped listings very often reuse the same factory photo, sometimes mirrored, recompressed,
 * resized or placed on a different plain background. Three cheap signals catch that:
 *  - dHash (64-bit gradient hash) of the product after trimming the background, plus its mirror;
 *  - an HSV colour histogram that ignores background-like pixels;
 *  - a 2×2-cell gradient-orientation histogram (rough shape), plus its mirror.
 * It is weak for lifestyle shots taken from different angles; callers keep a text score alongside.
 */

export interface ImageFingerprint {
  dhash: bigint;
  dhashMirror: bigint;
  color: Float64Array;
  edge: Float64Array;
  edgeMirror: Float64Array;
}

export interface VisualComparison {
  score: number;
  hash: number;
  color: number;
  edge: number;
}

const HUE_BINS = 8;
const SAT_BINS = 4;
const VAL_BINS = 4;
const EDGE_BINS = 8;
const EDGE_CELLS = 2;

/** Normalise orientation, drop the plain background, square it on white. */
async function productRaster(input: Buffer): Promise<Buffer> {
  const base = await sharp(input, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(256, 256, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  let trimmed = base;
  try {
    trimmed = await sharp(base).trim({ threshold: 18 }).png().toBuffer();
  } catch {
    // Uniform image: nothing to trim.
  }
  return trimmed;
}

async function gray(raster: Buffer, width: number, height: number, mirror = false): Promise<Uint8Array> {
  let img = sharp(raster).resize(width, height, { fit: "contain", background: "#ffffff" }).grayscale();
  if (mirror) img = img.flop();
  return new Uint8Array(await img.raw().toBuffer());
}

function dHash(px: Uint8Array): bigint {
  // 9×8 grayscale → 64 bits comparing horizontal neighbours.
  let hash = BigInt(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << BigInt(1)) | (px[y * 9 + x]! > px[y * 9 + x + 1]! ? BigInt(1) : BigInt(0));
    }
  }
  return hash;
}

function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return n;
}

function colorHistogram(rgb: Uint8Array): Float64Array {
  const hist = new Float64Array(HUE_BINS * SAT_BINS * VAL_BINS);
  let total = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i]! / 255;
    const g = rgb[i + 1]! / 255;
    const b = rgb[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const s = max === 0 ? 0 : (max - min) / max;
    // Skip studio-background pixels (near white / near black, unsaturated).
    if (s < 0.12 && (v > 0.9 || v < 0.08)) continue;
    let h = 0;
    if (max !== min) {
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      h = (h * 60 + 360) % 360;
    }
    const hb = s < 0.12 ? 0 : Math.min(HUE_BINS - 1, Math.floor((h / 360) * HUE_BINS));
    const sb = Math.min(SAT_BINS - 1, Math.floor(s * SAT_BINS));
    const vb = Math.min(VAL_BINS - 1, Math.floor(v * VAL_BINS));
    hist[(hb * SAT_BINS + sb) * VAL_BINS + vb]! += 1;
    total += 1;
  }
  if (total > 0) for (let i = 0; i < hist.length; i++) hist[i]! /= total;
  return hist;
}

function edgeHistogram(px: Uint8Array, size: number): Float64Array {
  const hist = new Float64Array(EDGE_CELLS * EDGE_CELLS * EDGE_BINS);
  const cell = size / EDGE_CELLS;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const at = (xx: number, yy: number) => px[yy * size + xx]!;
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const mag = Math.hypot(gx, gy);
      if (mag < 40) continue;
      const angle = (Math.atan2(gy, gx) + Math.PI) % Math.PI; // orientation, 0..π
      const bin = Math.min(EDGE_BINS - 1, Math.floor((angle / Math.PI) * EDGE_BINS));
      const c = Math.min(EDGE_CELLS - 1, Math.floor(y / cell)) * EDGE_CELLS + Math.min(EDGE_CELLS - 1, Math.floor(x / cell));
      hist[c * EDGE_BINS + bin]! += mag;
    }
  }
  return hist;
}

function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function intersection(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.min(a[i]!, b[i]!);
  return sum;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export async function fingerprintImage(input: Buffer): Promise<ImageFingerprint> {
  const raster = await productRaster(input);
  const [hashPx, hashMirrorPx, edgePx, edgeMirrorPx, rgb] = await Promise.all([
    gray(raster, 9, 8),
    gray(raster, 9, 8, true),
    gray(raster, 32, 32),
    gray(raster, 32, 32, true),
    sharp(raster).resize(64, 64, { fit: "contain", background: "#ffffff" }).removeAlpha().raw().toBuffer(),
  ]);
  return {
    dhash: dHash(hashPx),
    dhashMirror: dHash(hashMirrorPx),
    color: colorHistogram(new Uint8Array(rgb)),
    edge: edgeHistogram(edgePx, 32),
    edgeMirror: edgeHistogram(edgeMirrorPx, 32),
  };
}

/**
 * 0–100 visual similarity. Sub-scores are rescaled so unrelated photos land near 0
 * (random dHashes differ in ~32 of 64 bits; unrelated orientation histograms still correlate).
 */
export function compareFingerprints(a: ImageFingerprint, b: ImageFingerprint): VisualComparison {
  const bits = Math.min(hamming(a.dhash, b.dhash), hamming(a.dhash, b.dhashMirror));
  const hash = clamp01((1 - bits / 64 - 0.5) / 0.5);
  const color = clamp01(intersection(a.color, b.color));
  const edgeCos = Math.max(cosine(a.edge, b.edge), cosine(a.edge, b.edgeMirror));
  const edge = clamp01((edgeCos - 0.55) / 0.45);
  const score = Math.round(100 * (0.45 * hash + 0.3 * color + 0.25 * edge));
  return { score, hash: Math.round(hash * 100), color: Math.round(color * 100), edge: Math.round(edge * 100) };
}

/** Best comparison of one candidate against any of the reference images. */
export function bestComparison(references: ImageFingerprint[], candidate: ImageFingerprint): VisualComparison | null {
  let best: VisualComparison | null = null;
  for (const ref of references) {
    const c = compareFingerprints(ref, candidate);
    if (!best || c.score > best.score) best = c;
  }
  return best;
}
