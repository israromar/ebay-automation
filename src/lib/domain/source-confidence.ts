import { extractPackQuantity, type MatchResult } from "./matching";

/**
 * Combine text match and image similarity into one 0–100 confidence for "this AliExpress product is
 * the eBay product". Used by the Source finder, which always returns the closest candidates even
 * when none is a confident match.
 */

export type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW";

export interface ConfidenceInput {
  text: MatchResult;
  /** 0–100, or null when either image couldn't be fetched/decoded. */
  visual: number | null;
  ebayTitle: string;
  aeTitle: string;
}

export interface ConfidenceResult {
  confidence: number;
  tier: ConfidenceTier;
  reasons: string[];
}

export const HIGH_CONFIDENCE = 75;
export const MEDIUM_CONFIDENCE = 50;

export function tierFor(confidence: number): ConfidenceTier {
  return confidence >= HIGH_CONFIDENCE ? "HIGH" : confidence >= MEDIUM_CONFIDENCE ? "MEDIUM" : "LOW";
}

export function combineConfidence(input: ConfidenceInput): ConfidenceResult {
  const text = input.text.confidence;
  const reasons = [...input.text.reasons];
  let score = input.visual == null ? text * 0.9 : 0.55 * text + 0.45 * input.visual;

  const ebayPack = extractPackQuantity(input.ebayTitle);
  const aePack = extractPackQuantity(input.aeTitle);
  if (ebayPack != null && ebayPack > 1 && ebayPack === aePack) {
    score += 10;
    if (!reasons.includes("pack_quantity_match")) reasons.push("pack_quantity_match");
  }
  if (input.visual != null && input.visual >= 85) {
    score += 8;
    reasons.push("same_photo");
  } else if (input.visual != null && input.visual >= 65) {
    reasons.push("similar_photo");
  } else if (input.visual == null) {
    reasons.push("image_unavailable");
  }

  if (input.text.hardReject) {
    score = Math.min(score, 25);
  } else if (input.visual != null && input.visual < 30 && text < 60) {
    score = Math.min(score, 40);
    reasons.push("photo_differs");
  }

  const confidence = Math.max(0, Math.min(100, Math.round(score)));
  return { confidence, tier: tierFor(confidence), reasons: [...new Set(reasons)] };
}
