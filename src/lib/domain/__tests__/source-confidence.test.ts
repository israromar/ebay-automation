import { describe, expect, it } from "vitest";
import { combineConfidence, tierFor } from "@/lib/domain/source-confidence";

const text = (confidence: number, hardReject = false, reasons: string[] = []) => ({ confidence, hardReject, reasons });

describe("combineConfidence", () => {
  it("rates a strong text match with the same photo as HIGH", () => {
    const r = combineConfidence({ text: text(80), visual: 92, ebayTitle: "Electric Kettle 1.7L", aeTitle: "1.7L Electric Kettle" });
    expect(r.tier).toBe("HIGH");
    expect(r.reasons).toContain("same_photo");
  });

  it("lets a near-identical photo carry a weaker title", () => {
    const r = combineConfidence({ text: text(58), visual: 95, ebayTitle: "Kettle", aeTitle: "Water boiler" });
    expect(r.confidence).toBeGreaterThanOrEqual(75);
  });

  it("penalises missing image evidence", () => {
    const r = combineConfidence({ text: text(80), visual: null, ebayTitle: "a", aeTitle: "b" });
    expect(r.confidence).toBe(72);
    expect(r.reasons).toContain("image_unavailable");
  });

  it("caps hard rejects (accessory, wrong pack) at 25 but still scores them", () => {
    const r = combineConfidence({
      text: text(0, true, ["accessory_vs_main"]),
      visual: 95,
      ebayTitle: "Earbuds",
      aeTitle: "Case for earbuds",
    });
    expect(r.confidence).toBeLessThanOrEqual(25);
    expect(r.tier).toBe("LOW");
  });

  it("caps a weak title with a clearly different photo at 40", () => {
    const r = combineConfidence({ text: text(55), visual: 20, ebayTitle: "a", aeTitle: "b" });
    expect(r.confidence).toBeLessThanOrEqual(40);
    expect(r.reasons).toContain("photo_differs");
  });

  it("boosts an exact pack-size match", () => {
    const base = combineConfidence({ text: text(60), visual: 60, ebayTitle: "Bands", aeTitle: "Bands" }).confidence;
    const packed = combineConfidence({ text: text(60), visual: 60, ebayTitle: "11pcs Bands", aeTitle: "11 pcs Bands" }).confidence;
    expect(packed - base).toBe(10);
  });

  it("maps tiers at the boundaries", () => {
    expect([tierFor(75), tierFor(74), tierFor(50), tierFor(49)]).toEqual(["HIGH", "MEDIUM", "MEDIUM", "LOW"]);
  });
});
