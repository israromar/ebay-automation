import { describe, expect, it } from "vitest";
import { classifyAutomationDecision, detectAutomationCapabilities, parseAutomationConfig } from "@/lib/domain/automation";

describe("automation decision synthesis", () => {
  it("rejects candidates without a validated AE source", () => {
    expect(
      classifyAutomationDecision({
        status: "NEEDS_MANUAL_VALIDATION",
        aliexpressProductId: null,
        matchConfidence: null,
        minimumMatchConfidence: 70,
      }),
    ).toMatchObject({
      outcome: "REJECTED",
      reasons: expect.arrayContaining(["NO_QUALIFIED_ALIEXPRESS_SOURCE"]),
    });
  });

  it("requires evidence when demand or shipping is missing", () => {
    expect(
      classifyAutomationDecision({
        status: "NEEDS_MANUAL_VALIDATION",
        aliexpressProductId: "ae-1",
        matchConfidence: 88,
        aliexpressShippingMinor: 199,
        demandVerified: false,
        rejectionReasonsJson: JSON.stringify(["EBAY_SOLD_HISTORY_UNAVAILABLE"]),
        minimumMatchConfidence: 70,
      }).outcome,
    ).toBe("NEEDS_EVIDENCE");

    expect(
      classifyAutomationDecision({
        status: "NEEDS_MANUAL_VALIDATION",
        aliexpressProductId: "ae-1",
        matchConfidence: 88,
        aliexpressShippingMinor: null,
        demandVerified: true,
        rejectionReasonsJson: JSON.stringify(["MISSING_SHIPPING_COST"]),
        minimumMatchConfidence: 70,
      }).outcome,
    ).toBe("NEEDS_EVIDENCE");
  });

  it("marks demand-verified matched candidates ready for approval", () => {
    expect(
      classifyAutomationDecision({
        status: "APPROVED",
        aliexpressProductId: "ae-1",
        matchConfidence: 90,
        aliexpressShippingMinor: 0,
        demandVerified: true,
        minimumMatchConfidence: 70,
      }).outcome,
    ).toBe("READY_FOR_APPROVAL");
  });
});

describe("automation config and capabilities", () => {
  it("parses partial config with defaults", () => {
    expect(parseAutomationConfig(JSON.stringify({ topKeywords: 3 }))).toMatchObject({
      topKeywords: 3,
      topIdeas: 15,
      destination: "csv",
    });
  });

  it("exposes capability detection shape", () => {
    const capabilities = detectAutomationCapabilities();
    expect(capabilities).toEqual(
      expect.objectContaining({
        aliexpressOfficial: expect.any(Boolean),
        aliexpressImageSearch: expect.any(Boolean),
        ebayCredentials: expect.any(Boolean),
        visualMatch: expect.any(Boolean),
        googleSheets: expect.any(Boolean),
      }),
    );
  });
});
