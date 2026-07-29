import { prisma } from "@/lib/db";
import { DEFAULT_TREND_CRITERIA, scoreClustersForKeyword, type TrendResearchCriteria } from "@/lib/domain/trend-scoring";
import { logInfo } from "@/lib/logger";
import type { EbayProvider } from "@/lib/providers/types";
import { ensureDefaultWorkspace } from "./providers";

export interface TrendResearchInput {
  keywords: string[];
  criteria?: TrendResearchCriteria;
  /** Browse page size per keyword (before clustering). */
  searchLimit?: number;
}

export class TrendResearchService {
  constructor(private readonly ebay: EbayProvider) {}

  async run(input: TrendResearchInput) {
    const keywords = input.keywords.map((k) => k.trim()).filter(Boolean);
    if (keywords.length === 0) {
      throw new Error("At least one keyword is required");
    }

    const criteria = { ...DEFAULT_TREND_CRITERIA, ...input.criteria };
    const workspace = await ensureDefaultWorkspace();
    const searchLimit = Math.min(input.searchLimit ?? 50, 50);

    const run = await prisma.trendResearchRun.create({
      data: {
        workspaceId: workspace.id,
        keywordsJson: JSON.stringify(keywords),
        criteriaJson: JSON.stringify(criteria),
        status: "RUNNING",
      },
    });

    try {
      const allIdeas = [];
      for (const keyword of keywords) {
        const listings = await this.ebay.searchProducts({
          keyword,
          limit: searchLimit,
        });
        const scored = scoreClustersForKeyword(keyword, listings, criteria);
        for (const idea of scored) {
          const created = await prisma.trendIdea.create({
            data: {
              runId: run.id,
              ebayItemId: idea.ebayItemId,
              title: idea.title,
              ebayUrl: idea.ebayUrl,
              imageUrl: idea.imageUrl,
              priceMinor: idea.priceMinor,
              currency: idea.currency,
              categoryId: idea.categoryId,
              searchKeyword: idea.searchKeyword,
              clusterKey: idea.clusterKey,
              activeListingCount: idea.activeListingCount,
              priceMinMinor: idea.priceMinMinor,
              priceMaxMinor: idea.priceMaxMinor,
              priceMedianMinor: idea.priceMedianMinor,
              score: idea.score,
              status: "DISCOVERED",
              dataSource: "ebay_browse_proxy",
            },
          });
          allIdeas.push(created);
        }
      }

      await prisma.trendResearchRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", finishedAt: new Date() },
      });
      await prisma.auditLog.create({
        data: {
          action: "TREND_RESEARCH_COMPLETED",
          entityType: "TrendResearchRun",
          entityId: run.id,
          detailJson: JSON.stringify({ keywords, ideaCount: allIdeas.length }),
        },
      });
      await prisma.dataSourceHealthEvent.create({
        data: {
          provider: this.ebay.name,
          status: "OK",
          message: `Trend research: ${allIdeas.length} ideas from ${keywords.length} keywords`,
        },
      });

      logInfo("trend_research_completed", { runId: run.id, count: allIdeas.length });
      return { runId: run.id, ideas: allIdeas };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await prisma.trendResearchRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      await prisma.dataSourceHealthEvent.create({
        data: {
          provider: this.ebay.name,
          status: "ERROR",
          message,
        },
      });
      throw e;
    }
  }
}
