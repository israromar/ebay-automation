import { describe, expect, it } from "vitest";
import { deriveTrendIdeaMatchStatus } from "@/lib/domain/trend-match-status";

describe("deriveTrendIdeaMatchStatus", () => {
  it("rejects an attached source below minimum confidence", () => {
    expect(
      deriveTrendIdeaMatchStatus({
        aliexpressProductId: "ae-1",
        matchConfidence: 61,
        candidateStatus: "NEEDS_MANUAL_VALIDATION",
        rejectionReasonsJson: JSON.stringify(["MATCH_CONFIDENCE_TOO_LOW"]),
        minimumMatchConfidence: 70,
      }),
    ).toBe("REJECTED");
  });

  it("rejects a source when required visual evidence is unavailable", () => {
    expect(
      deriveTrendIdeaMatchStatus({
        aliexpressProductId: "ae-1",
        matchConfidence: 82,
        candidateStatus: "NEEDS_MANUAL_VALIDATION",
        rejectionReasonsJson: JSON.stringify(["VISUAL_MATCH_UNAVAILABLE"]),
        minimumMatchConfidence: 70,
      }),
    ).toBe("REJECTED");
  });

  it("rejects a source that costs more than the eBay listing", () => {
    expect(
      deriveTrendIdeaMatchStatus({
        aliexpressProductId: "ae-1",
        matchConfidence: 90,
        candidateStatus: "UNPROFITABLE",
        rejectionReasonsJson: JSON.stringify(["SOURCE_PRICE_NOT_BELOW_EBAY"]),
        minimumMatchConfidence: 70,
      }),
    ).toBe("REJECTED");
  });

  it("rejects when below the optional high-quality bar", () => {
    expect(
      deriveTrendIdeaMatchStatus({
        aliexpressProductId: "ae-1",
        matchConfidence: 90,
        candidateStatus: "UNPROFITABLE",
        rejectionReasonsJson: JSON.stringify(["BELOW_HIGH_QUALITY_BAR", "HIGH_QUALITY_MARGIN_TOO_LOW"]),
        minimumMatchConfidence: 70,
      }),
    ).toBe("REJECTED");
  });
});
