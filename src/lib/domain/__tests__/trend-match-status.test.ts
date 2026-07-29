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

  it("keeps a qualified AE match despite unrelated manual demand checks", () => {
    expect(
      deriveTrendIdeaMatchStatus({
        aliexpressProductId: "ae-1",
        matchConfidence: 82,
        candidateStatus: "NEEDS_MANUAL_VALIDATION",
        rejectionReasonsJson: JSON.stringify(["EBAY_SOLD_HISTORY_UNAVAILABLE", "MISSING_SHIPPING_COST"]),
        minimumMatchConfidence: 70,
      }),
    ).toBe("AE_MATCHED");
  });
});
