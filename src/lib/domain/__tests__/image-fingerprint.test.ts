import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { compareFingerprints, fingerprintImage } from "@/lib/domain/image-fingerprint";

/** Synthetic "product photo": a kettle-like body + handle + spout on a plain background. */
function productSvg(opts: { bg?: string; body?: string; accent?: string } = {}) {
  const { bg = "#ffffff", body = "#d7263d", accent = "#1b998b" } = opts;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
    <rect width="100%" height="100%" fill="${bg}"/>
    <rect x="170" y="200" width="220" height="280" rx="40" fill="${body}"/>
    <rect x="210" y="150" width="140" height="60" fill="${accent}"/>
    <path d="M 390 260 Q 500 330 390 420" stroke="${accent}" stroke-width="30" fill="none"/>
    <polygon points="170,260 90,220 170,320" fill="${body}"/>
  </svg>`);
}

function otherSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <circle cx="300" cy="300" r="180" fill="#f4d35e"/>
    <circle cx="300" cy="300" r="80" fill="#3d348b"/>
    <line x1="80" y1="520" x2="520" y2="80" stroke="#3d348b" stroke-width="18"/>
  </svg>`);
}

const png = (svg: Buffer) => sharp(svg).png().toBuffer();

describe("image fingerprint", () => {
  it("scores the same product photo on another plain background, resized and recompressed as a match", async () => {
    const a = await fingerprintImage(await png(productSvg()));
    const grey = await sharp(productSvg({ bg: "#eeeeee" }))
      .extend({ top: 90, bottom: 40, left: 120, right: 60, background: "#eeeeee" })
      .resize(420)
      .jpeg({ quality: 60 })
      .toBuffer();
    const b = await fingerprintImage(grey);
    const c = compareFingerprints(a, b);
    expect(c.score).toBeGreaterThanOrEqual(85);
  });

  it("scores a mirrored copy as a match", async () => {
    const a = await fingerprintImage(await png(productSvg()));
    const b = await fingerprintImage(await sharp(productSvg()).flop().png().toBuffer());
    expect(compareFingerprints(a, b).score).toBeGreaterThanOrEqual(85);
  });

  it("keeps shape similarity but drops colour for another colourway", async () => {
    const a = await fingerprintImage(await png(productSvg()));
    const b = await fingerprintImage(await png(productSvg({ body: "#2e86ab", accent: "#f18f01" })));
    const c = compareFingerprints(a, b);
    expect(c.edge).toBeGreaterThanOrEqual(80);
    expect(c.color).toBeLessThanOrEqual(30);
  });

  it("scores a different product low", async () => {
    const a = await fingerprintImage(await png(productSvg()));
    const b = await fingerprintImage(await png(otherSvg()));
    expect(compareFingerprints(a, b).score).toBeLessThanOrEqual(40);
  });
});
