import { describe, expect, it } from "vitest";
import { hashExtensionToken } from "@/lib/auth/extension-token";
import { DAY_MS } from "@/lib/domain/demand";
import { keepImportedDemand } from "@/lib/services/tracking";

const now = new Date("2026-09-27T12:00:00Z");

describe("demand precedence when a snapshot is recorded", () => {
  it("keeps a fresh purchase-history count even over VERIFIED snapshots", () => {
    expect(
      keepImportedDemand({ demandSource: "purchase_history", purchaseHistoryAt: new Date(now.getTime() - 2 * DAY_MS) }, "VERIFIED", now),
    ).toBe(true);
  });
  it("hands back to snapshots once the purchase-history count is a week old", () => {
    expect(
      keepImportedDemand({ demandSource: "purchase_history", purchaseHistoryAt: new Date(now.getTime() - 8 * DAY_MS) }, "PROJECTED", now),
    ).toBe(false);
  });
  it("keeps Terapeak until snapshots are VERIFIED", () => {
    expect(keepImportedDemand({ demandSource: "terapeak" }, "PROJECTED", now)).toBe(true);
    expect(keepImportedDemand({ demandSource: "terapeak" }, "VERIFIED", now)).toBe(false);
  });
  it("never keeps browse-tracker numbers", () => {
    expect(keepImportedDemand({ demandSource: "browse_tracker" }, "ESTIMATED", now)).toBe(false);
  });
});

describe("extension token hashing", () => {
  it("is stable, trims whitespace and never equals the token", () => {
    const t = "hx_abc123";
    expect(hashExtensionToken(t)).toBe(hashExtensionToken(` ${t}\n`));
    expect(hashExtensionToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashExtensionToken(t)).not.toContain("abc123");
  });
});
