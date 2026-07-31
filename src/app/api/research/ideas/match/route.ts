import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_HIGH_QUALITY_THRESHOLDS, evaluateHighQualityFilter, withHighQualityRules } from "@/lib/domain/high-quality-filter";
import { deriveTrendIdeaMatchStatus } from "@/lib/domain/trend-match-status";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import { createAliExpressProvider, createEbayProvider, createVisualMatchProvider, loadWorkspaceRules } from "@/lib/services/providers";
import { z } from "zod";

const schema = z.object({
  ideaIds: z.array(z.string().min(1)).min(1).max(20),
  highQualityFilter: z.boolean().optional(),
  highQualityMinEbayPriceMinor: z.number().int().min(500).max(100_000).optional(),
  highQualityMaxAeLandedCostRatio: z.number().min(0.05).max(0.95).optional(),
  highQualityMinNetMarginPercent: z.number().min(5).max(80).optional(),
  highQualityMinOrderCount: z.number().int().min(10).max(100_000).optional(),
});

function parseReasons(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rules = await loadWorkspaceRules();
  const hqEnabled = parsed.data.highQualityFilter === true;
  const thresholds = {
    minEbayPriceMinor: parsed.data.highQualityMinEbayPriceMinor ?? DEFAULT_HIGH_QUALITY_THRESHOLDS.minEbayPriceMinor,
    maxAeLandedCostRatio: parsed.data.highQualityMaxAeLandedCostRatio ?? DEFAULT_HIGH_QUALITY_THRESHOLDS.maxAeLandedCostRatio,
    minNetMarginPercent: parsed.data.highQualityMinNetMarginPercent ?? DEFAULT_HIGH_QUALITY_THRESHOLDS.minNetMarginPercent,
    minOrderCount: parsed.data.highQualityMinOrderCount ?? DEFAULT_HIGH_QUALITY_THRESHOLDS.minOrderCount,
  };
  const effectiveRules = hqEnabled ? withHighQualityRules(rules, thresholds) : rules;

  const orchestrator = new ScanOrchestrator({
    aliexpress: createAliExpressProvider(),
    ebay: createEbayProvider(),
    visualMatch: createVisualMatchProvider(),
    rules: effectiveRules,
  });
  const result = await orchestrator.matchTrendIdeas(parsed.data.ideaIds);

  let highQualityRejected = 0;
  if (hqEnabled) {
    for (const candidate of result.candidates) {
      const hqReasons = evaluateHighQualityFilter(
        {
          ebayCurrentPriceMinor: candidate.ebayCurrentPriceMinor,
          aliexpressPriceMinor: candidate.aliexpressPriceMinor,
          aliexpressShippingMinor: candidate.aliexpressShippingMinor,
          netMarginPercent: candidate.netMarginPercent,
          orderCount: candidate.orderCount,
        },
        thresholds,
      );
      if (hqReasons.length === 0) continue;

      const merged = [...new Set([...parseReasons(candidate.rejectionReasonsJson), "BELOW_HIGH_QUALITY_BAR", ...hqReasons])];
      const rejectionReasonsJson = JSON.stringify(merged);
      const updated = await prisma.productCandidate.update({
        where: { id: candidate.id },
        data: {
          rejectionReasonsJson,
          status: candidate.status === "APPROVED" ? "UNPROFITABLE" : candidate.status,
        },
      });
      const ideaStatus = deriveTrendIdeaMatchStatus({
        aliexpressProductId: updated.aliexpressProductId,
        matchConfidence: updated.matchConfidence,
        candidateStatus: updated.status,
        rejectionReasonsJson,
        minimumMatchConfidence: effectiveRules.minimumMatchConfidence,
      });
      await prisma.trendIdea.updateMany({
        where: { productCandidateId: candidate.id },
        data: { status: ideaStatus, rejectionReasonsJson },
      });
      candidate.rejectionReasonsJson = rejectionReasonsJson;
      candidate.status = updated.status;
      highQualityRejected += 1;
    }
  }

  return NextResponse.json({ ...result, highQualityFilter: hqEnabled, highQualityRejected });
}
