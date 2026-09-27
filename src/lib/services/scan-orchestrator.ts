import { prisma } from "@/lib/db";
import { calculateMaxAcceptableSupplierCost, calculateProfit, formatMinor } from "@/lib/domain/profit";
import {
  candidateStatusFromSnapshot,
  finalizeProductIntelligence,
  qualifyEbaySide,
  type ProductResearchSnapshot,
  type SupplierQualificationInput,
} from "@/lib/domain/product-intelligence";
import {
  buildAliExpressSearchQueries,
  candidateFingerprint,
  jaccardSimilarity,
  scoreAliExpressSourceMatch,
  scoreProductMatch,
  tokenSet,
} from "@/lib/domain/matching";
import { qualifyAliExpressProduct } from "@/lib/domain/qualification";
import {
  applyVisualScoresToRankedSources,
  hasItemPriceBelowEbay,
  hasSourcingPriceAdvantage,
  isKnownShippingCost,
  rankAliExpressSources,
} from "@/lib/domain/source-ranking";
import { deriveTrendIdeaMatchStatus } from "@/lib/domain/trend-match-status";
import { DEFAULT_VISUAL_MATCH_FLOOR } from "@/lib/domain/visual-matching";
import {
  DEFAULT_RULES,
  type AliExpressProduct,
  type CandidateStatus,
  type EbayListing,
  type QualificationRules,
  type RejectionCode,
} from "@/lib/domain/types";
import type { ExportCandidateRow } from "@/lib/export/types";
import { logInfo, logWarn } from "@/lib/logger";
import type { AliExpressProvider, EbayProvider, SpreadsheetExporter } from "@/lib/providers/types";
import type { VisualMatchProvider } from "@/lib/providers/visual-match";
import { ensureDefaultWorkspace } from "./providers";

export interface ScanInput {
  keyword: string;
  mode?: "keyword" | "aliexpress_url" | "ebay_url" | "batch";
  limit?: number;
  projectName?: string;
  rules?: Partial<QualificationRules>;
  aliexpressUrl?: string;
  ebayItemId?: string;
  ebayUrl?: string;
}

export interface ScanOrchestratorDeps {
  aliexpress: AliExpressProvider;
  ebay: EbayProvider;
  exporter?: SpreadsheetExporter;
  rules?: QualificationRules;
  visualMatch?: VisualMatchProvider;
  /** When set, new projects/scans are created under this workspace. */
  workspaceId?: string;
}

export class ScanOrchestrator {
  private rules: QualificationRules;

  constructor(private readonly deps: ScanOrchestratorDeps) {
    this.rules = { ...DEFAULT_RULES, ...deps.rules };
  }

  private async resolveWorkspaceId() {
    if (this.deps.workspaceId) return this.deps.workspaceId;
    return (await ensureDefaultWorkspace()).id;
  }

  async run(input: ScanInput) {
    const workspaceId = await this.resolveWorkspaceId();
    const project = await prisma.searchProject.create({
      data: {
        name: input.projectName ?? `Scan ${input.keyword}`,
        workspaceId,
        keywords: { create: [{ keyword: input.keyword }] },
      },
    });

    const mode = input.mode ?? (input.ebayItemId || input.ebayUrl ? "ebay_url" : "keyword");
    const scan = await prisma.scan.create({
      data: {
        projectId: project.id,
        keyword: input.keyword,
        mode,
        status: "RUNNING",
      },
    });

    await prisma.auditLog.create({
      data: {
        scanId: scan.id,
        action: "SCAN_STARTED",
        detailJson: JSON.stringify({ keyword: input.keyword, mode }),
      },
    });

    const job = await prisma.scanJob.create({
      data: {
        scanId: scan.id,
        type: mode === "ebay_url" ? "EBAY_TO_AE_RESEARCH" : "FULL_RESEARCH",
        status: "RUNNING",
        attempts: 1,
        startedAt: new Date(),
        payloadJson: JSON.stringify(input),
      },
    });

    try {
      const results = [];
      if (mode === "ebay_url") {
        const itemId = input.ebayItemId ?? extractEbayItemId(input.ebayUrl ?? "");
        if (!itemId) {
          throw new Error("ebayItemId or ebayUrl is required for ebay_url mode");
        }
        const listing = await this.deps.ebay.getListingDetails(itemId);
        results.push(await this.processEbaySeededProduct(scan.id, input.keyword, listing));
      } else {
        let aeProducts: AliExpressProduct[];
        if (input.aliexpressUrl) {
          aeProducts = [await this.deps.aliexpress.getProductDetails(input.aliexpressUrl)];
        } else {
          aeProducts = await this.deps.aliexpress.searchProducts({
            keyword: input.keyword,
            limit: input.limit ?? 5,
          });
        }
        for (const ae of aeProducts.slice(0, input.limit ?? 5)) {
          results.push(await this.processAliExpressProduct(scan.id, input.keyword, ae));
        }
      }

      await prisma.scanJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
          resultJson: JSON.stringify({ count: results.length }),
        },
      });
      await prisma.scan.update({
        where: { id: scan.id },
        data: { status: "COMPLETED", finishedAt: new Date() },
      });
      await prisma.dataSourceHealthEvent.create({
        data: {
          provider: this.deps.aliexpress.name,
          status: "OK",
          message: `Processed ${results.length} products`,
        },
      });

      logInfo("scan_completed", { scanId: scan.id, count: results.length });
      return { scanId: scan.id, candidates: results };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await prisma.scanJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          lastError: message,
          deadLetter: true,
          finishedAt: new Date(),
        },
      });
      await prisma.scan.update({
        where: { id: scan.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      await prisma.dataSourceHealthEvent.create({
        data: {
          provider: "ScanOrchestrator",
          status: "ERROR",
          message,
        },
      });
      throw e;
    }
  }

  /** Match selected trend ideas to AliExpress and create ProductCandidates. */
  async matchTrendIdeas(ideaIds: string[]) {
    const ideas = await prisma.trendIdea.findMany({
      where: { id: { in: ideaIds } },
    });
    if (ideas.length === 0) {
      return { candidates: [] as Awaited<ReturnType<ScanOrchestrator["processEbaySeededProduct"]>>[] };
    }

    const workspaceId = await this.resolveWorkspaceId();
    const project = await prisma.searchProject.create({
      data: {
        name: `Trend AE match ${new Date().toISOString().slice(0, 10)}`,
        workspaceId,
        keywords: {
          create: [
            {
              keyword: ideas[0]?.searchKeyword ?? "trend",
            },
          ],
        },
      },
    });
    const scan = await prisma.scan.create({
      data: {
        projectId: project.id,
        keyword:
          ideas
            .map((i) => i.searchKeyword)
            .filter(Boolean)
            .join(", ")
            .slice(0, 120) || "trend",
        mode: "ebay_url",
        status: "RUNNING",
      },
    });

    const candidates = [];
    for (const idea of ideas) {
      await prisma.trendIdea.update({
        where: { id: idea.id },
        data: { status: "AE_MATCH_QUEUED" },
      });
      try {
        const listing = {
          itemId: idea.ebayItemId,
          title: idea.title,
          url: idea.ebayUrl ?? `https://www.ebay.com/itm/${idea.ebayItemId}`,
          imageUrl: idea.imageUrl ?? undefined,
          priceMinor: idea.priceMinor,
          currency: idea.currency,
          categoryId: idea.categoryId ?? undefined,
          condition: "NEW",
          meta: {
            source: idea.dataSource,
            confidence: 0.9,
            collectedAt: new Date().toISOString(),
            completeness: "partial" as const,
            warnings: ["Seeded from trend idea; Browse getItem skipped"],
          },
        };
        const candidate = await this.processEbaySeededProduct(scan.id, idea.searchKeyword ?? idea.title.slice(0, 80), listing, {
          activeListingCount: idea.activeListingCount,
          priceMinMinor: idea.priceMinMinor,
          priceMaxMinor: idea.priceMaxMinor,
          priceMedianMinor: idea.priceMedianMinor,
          sellerCount: idea.sellerCount,
          topSellerListingShare: idea.topSellerListingShare,
        });

        const ideaStatus =
          !candidate.aliexpressProductId && candidate.status === "NEEDS_MANUAL_VALIDATION"
            ? "NEEDS_EVIDENCE"
            : candidate.classification === "strong_candidate" && candidate.status === "APPROVED"
              ? "AE_MATCHED"
              : deriveTrendIdeaMatchStatus({
                  aliexpressProductId: candidate.aliexpressProductId,
                  matchConfidence: candidate.matchConfidence,
                  candidateStatus: candidate.status,
                  rejectionReasonsJson: candidate.rejectionReasonsJson,
                  minimumMatchConfidence: this.rules.minimumMatchConfidence,
                });

        await prisma.trendIdea.update({
          where: { id: idea.id },
          data: {
            status: ideaStatus,
            productCandidateId: candidate.id,
            rejectionReasonsJson: candidate.rejectionReasonsJson,
            opportunityScore: candidate.opportunityScore,
            classification: candidate.classification,
            researchSnapshotJson: candidate.researchSnapshotJson,
            ...(typeof candidate.soldLast30Days === "number" ? { soldLast30Days: candidate.soldLast30Days } : {}),
          },
        });
        candidates.push(candidate);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await prisma.trendIdea.update({
          where: { id: idea.id },
          data: {
            status: "REJECTED",
            rejectionReasonsJson: JSON.stringify([message]),
          },
        });
      }
    }

    await prisma.scan.update({
      where: { id: scan.id },
      data: { status: "COMPLETED", finishedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        scanId: scan.id,
        action: "TREND_IDEAS_MATCHED",
        detailJson: JSON.stringify({ ideaIds, candidateCount: candidates.length }),
      },
    });

    return { scanId: scan.id, candidates };
  }

  private async processAliExpressProduct(scanId: string, keyword: string, ae: AliExpressProduct) {
    const fingerprint = candidateFingerprint({
      aliexpressProductId: ae.productId,
      title: ae.title,
    });

    let status: CandidateStatus = "COLLECTING";
    const rejectionCodes: RejectionCode[] = [];

    const qual = qualifyAliExpressProduct(ae, this.rules);
    if (qual.reasons.length > 0) {
      status = "ALIEXPRESS_REJECTED";
      rejectionCodes.push(...qual.reasons);
    } else if (qual.missingFields.length > 0) {
      // Affiliate API often omits review counts — continue matching, require manual check.
      status = "NEEDS_MANUAL_VALIDATION";
    }

    type MatchCandidate = {
      itemId: string;
      url: string;
      priceMinor: number;
      confidence: number;
      title: string;
    };
    let selectedMatch: MatchCandidate | undefined;
    let activeListingCount = 0;
    let foundPriceInversion = false;
    let foundInsufficientMargin = false;

    if (status !== "ALIEXPRESS_REJECTED") {
      // For incomplete AliExpress fields, still attempt eBay matching so operator has comps.
      const ebayListings = await this.deps.ebay.searchProducts({
        keyword: ae.title.slice(0, 80),
        limit: 10,
      });
      activeListingCount = ebayListings.length;

      let topConfidence = 0;
      for (const listing of ebayListings) {
        const match = scoreProductMatch(
          { title: ae.title, packQuantity: null, condition: "NEW" },
          {
            title: listing.title,
            condition: listing.condition,
            categoryId: listing.categoryId,
            priceMinor: listing.priceMinor,
          },
        );
        if (!match.hardReject && match.confidence >= this.rules.minimumMatchConfidence) {
          const maxSupplierCost = calculateMaxAcceptableSupplierCost({
            expectedSellingPriceMinor: listing.priceMinor,
            additionalSourcingCostMinor: this.rules.additionalSourcingCostMinor,
            ebayFeeRate: this.rules.ebayFeeRate,
            promotedListingRate: this.rules.promotedListingRate,
            expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
            expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
            otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
            otherPercentageCost: this.rules.otherPercentageCost,
            minimumNetMarginPercent: this.rules.minimumNetMarginPercent,
            minimumProfitMinor: this.rules.minimumProfitMinor,
          });
          if (isKnownShippingCost(ae.shippingMinor)) {
            if (ae.priceMinor + ae.shippingMinor > maxSupplierCost) {
              foundInsufficientMargin = true;
              continue;
            }
            if (!hasSourcingPriceAdvantage(listing.priceMinor, ae.priceMinor, ae.shippingMinor)) {
              foundPriceInversion = true;
              continue;
            }
            const listingProfit = calculateProfit({
              aliexpressItemPriceMinor: ae.priceMinor,
              aliexpressShippingCostMinor: ae.shippingMinor,
              additionalSourcingCostMinor: this.rules.additionalSourcingCostMinor,
              expectedSellingPriceMinor: listing.priceMinor,
              ebayFeeRate: this.rules.ebayFeeRate,
              promotedListingRate: this.rules.promotedListingRate,
              expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
              expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
              otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
              otherPercentageCost: this.rules.otherPercentageCost,
            });
            if (listingProfit.profitMarginPercent < this.rules.minimumNetMarginPercent) {
              foundInsufficientMargin = true;
              continue;
            }
          } else if (ae.priceMinor > maxSupplierCost || !hasItemPriceBelowEbay(listing.priceMinor, ae.priceMinor)) {
            foundPriceInversion = true;
            continue;
          }
        }
        if (!match.hardReject && match.confidence > topConfidence) {
          topConfidence = match.confidence;
          selectedMatch = {
            itemId: listing.itemId,
            url: listing.url,
            priceMinor: listing.priceMinor,
            confidence: match.confidence,
            title: listing.title,
          };
        }
      }

      if (!selectedMatch || selectedMatch.confidence < this.rules.minimumMatchConfidence) {
        if (!selectedMatch && (foundPriceInversion || foundInsufficientMargin)) {
          status = "UNPROFITABLE";
          rejectionCodes.push(foundPriceInversion ? "SOURCE_PRICE_NOT_BELOW_EBAY" : "MARGIN_TOO_LOW");
        } else {
          status = "EBAY_MATCH_REQUIRED";
        }
        if (selectedMatch && selectedMatch.confidence < this.rules.minimumMatchConfidence) {
          rejectionCodes.push("MATCH_CONFIDENCE_TOO_LOW");
        }
      } else {
        status = "EBAY_MATCHED";
      }
    }

    const matchSnapshot = selectedMatch as MatchCandidate | undefined;

    let demandVerified = false;
    let soldLast30Days: number | undefined;
    let avgCompleted: number | undefined;
    let demandSource: string | undefined;
    let medianCompleted: number | undefined;

    if (status === "EBAY_MATCHED" && matchSnapshot) {
      const demand = await this.deps.ebay.getMarketDemand({
        keyword: ae.title,
        itemId: matchSnapshot.itemId,
      });
      demandSource = demand.source;
      if (!demand.available) {
        status = "NEEDS_MANUAL_VALIDATION";
        rejectionCodes.push(demand.reasonCode ?? "EBAY_SOLD_HISTORY_UNAVAILABLE");
      } else {
        demandVerified = true;
        soldLast30Days = demand.soldLast30Days;
        avgCompleted = demand.avgCompletedSaleMinor;
        medianCompleted = demand.medianCompletedSaleMinor;
        if ((soldLast30Days ?? 0) < this.rules.minimumRecentSales) {
          status = "DEMAND_NOT_VERIFIED";
          rejectionCodes.push("EBAY_RECENT_SALES_TOO_LOW");
        }
      }
    }

    const shipping = ae.shippingMinor;
    const shippingKnown = isKnownShippingCost(shipping);
    if (!shippingKnown && status !== "ALIEXPRESS_REJECTED") {
      rejectionCodes.push("MISSING_SHIPPING_COST");
      if (status === "EBAY_MATCHED") {
        status = "NEEDS_MANUAL_VALIDATION";
      }
    }

    const expectedPrice = matchSnapshot?.priceMinor ?? 0;
    const matchedItemId = matchSnapshot?.itemId;
    const matchedUrl = matchSnapshot?.url;
    const matchedConfidence = matchSnapshot?.confidence;
    const matchedTitle = matchSnapshot?.title;
    const profit = isKnownShippingCost(shipping)
      ? calculateProfit({
          aliexpressItemPriceMinor: ae.priceMinor,
          aliexpressShippingCostMinor: shipping,
          additionalSourcingCostMinor: this.rules.additionalSourcingCostMinor,
          expectedSellingPriceMinor: expectedPrice,
          ebayFeeRate: this.rules.ebayFeeRate,
          promotedListingRate: this.rules.promotedListingRate,
          expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
          expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
          otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
          otherPercentageCost: this.rules.otherPercentageCost,
        })
      : null;

    if (
      demandVerified &&
      status !== "DEMAND_NOT_VERIFIED" &&
      status !== "ALIEXPRESS_REJECTED" &&
      status !== "EBAY_MATCH_REQUIRED" &&
      status !== "NEEDS_MANUAL_VALIDATION"
    ) {
      if (!profit || profit.profitMarginPercent < this.rules.minimumNetMarginPercent) {
        status = profit ? "UNPROFITABLE" : "NEEDS_MANUAL_VALIDATION";
        rejectionCodes.push(profit ? "MARGIN_TOO_LOW" : "MISSING_SHIPPING_COST");
      } else {
        status = "APPROVED";
      }
    }

    // Never approve without verified demand or known shipping
    if (status === "APPROVED" && !demandVerified) {
      status = "NEEDS_MANUAL_VALIDATION";
      rejectionCodes.push("EBAY_SOLD_HISTORY_UNAVAILABLE");
    }
    if (status === "APPROVED" && !shippingKnown) {
      status = "NEEDS_MANUAL_VALIDATION";
      rejectionCodes.push("MISSING_SHIPPING_COST");
    }

    const intelligence =
      matchedItemId && expectedPrice > 0
        ? finalizeProductIntelligence(
            qualifyEbaySide({
              ebayItemId: matchedItemId,
              ebayTitle: matchedTitle ?? ae.title,
              listingPriceMinor: expectedPrice,
              medianCompletedSaleMinor: medianCompleted,
              avgCompletedSaleMinor: avgCompleted,
              demandAvailable: demandVerified,
              demandSource,
              sales: {
                sold7d: null,
                sold30d: soldLast30Days ?? null,
                sold90d: null,
                sold365d: null,
              },
              activeListingCount,
              rules: this.rules,
            }),
            {
              productId: ae.productId,
              title: ae.title,
              rating: ae.rating,
              reviewCount: ae.reviewCount,
              orderCount: ae.orderCount,
              priceMinor: ae.priceMinor,
              shippingMinor: ae.shippingMinor,
              matchConfidence: matchedConfidence ?? 0,
              matchHardReject: false,
              matchRejectReasons: [],
            },
          )
        : null;
    if (intelligence) {
      status = candidateStatusFromSnapshot(intelligence, shippingKnown);
      for (const code of intelligence.rejectIds) {
        if (!rejectionCodes.includes(code as RejectionCode)) rejectionCodes.push(code as RejectionCode);
      }
    }

    const candidate = await prisma.productCandidate.create({
      data: {
        scanId,
        fingerprint,
        status,
        productName: ae.title,
        imageUrl: ae.imageUrl,
        searchKeyword: keyword,
        aliexpressProductId: ae.productId,
        aliexpressUrl: ae.url,
        aliexpressPriceMinor: ae.priceMinor,
        aliexpressShippingMinor: shipping ?? null,
        adjustedSourceCostMinor: profit?.adjustedSourceCostMinor ?? null,
        rating: ae.rating,
        reviewCount: ae.reviewCount,
        orderCount: ae.orderCount,
        ebayItemId: matchedItemId,
        ebayUrl: matchedUrl,
        ebayCurrentPriceMinor: expectedPrice || null,
        avgCompletedSaleMinor: avgCompleted,
        soldLast30Days,
        activeListingCount,
        matchConfidence: matchedConfidence,
        estimatedProfitMinor: profit?.estimatedProfitMinor ?? null,
        netMarginPercent: profit?.profitMarginPercent ?? null,
        returnOnCostPercent: profit?.returnOnCostPercent ?? null,
        rejectionReasonsJson: JSON.stringify(rejectionCodes),
        demandVerified,
        opportunityScore: intelligence?.opportunityScore ?? null,
        classification: intelligence?.classification ?? null,
        researchSnapshotJson: intelligence ? JSON.stringify(intelligence) : null,
        dataSource: ae.meta.source,
        lastVerifiedAt: new Date(),
        aliexpressProducts: {
          create: {
            productId: ae.productId,
            title: ae.title,
            url: ae.url,
            imageUrl: ae.imageUrl,
            priceMinor: ae.priceMinor,
            shippingMinor: shipping,
            currency: ae.currency,
            rating: ae.rating,
            reviewCount: ae.reviewCount,
            orderCount: ae.orderCount,
            rawJson: JSON.stringify(ae),
          },
        },
        sourceProducts: {
          create: {
            marketplace: "aliexpress",
            externalId: ae.productId,
            url: ae.url,
            rawJson: JSON.stringify(ae),
            confidence: ae.meta.confidence,
            completeness: ae.meta.completeness,
            warningsJson: JSON.stringify(ae.meta.warnings),
          },
        },
        ...(profit
          ? {
              profitCalculations: {
                create: {
                  expectedSellingPriceMinor: expectedPrice,
                  grossRevenueMinor: profit.grossRevenueMinor,
                  adjustedSourceCostMinor: profit.adjustedSourceCostMinor,
                  marketplaceFeesMinor: profit.marketplaceFeesMinor,
                  promotedListingFeeMinor: profit.promotedListingFeeMinor,
                  expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
                  expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
                  otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
                  totalEstimatedCostMinor: profit.totalEstimatedCostMinor,
                  estimatedProfitMinor: profit.estimatedProfitMinor,
                  profitMarginPercent: profit.profitMarginPercent,
                  returnOnCostPercent: profit.returnOnCostPercent,
                  assumptionsJson: JSON.stringify(this.rules),
                },
              },
            }
          : {}),
        rejectionReasons: {
          create: rejectionCodes.map((code) => ({ code })),
        },
        ...(matchedItemId && matchedUrl && matchedConfidence != null && matchedTitle
          ? {
              matches: {
                create: {
                  ebayItemId: matchedItemId,
                  confidence: matchedConfidence,
                  reasonsJson: JSON.stringify({ title: matchedTitle }),
                },
              },
              ebayListings: {
                create: {
                  itemId: matchedItemId,
                  title: matchedTitle,
                  url: matchedUrl,
                  priceMinor: expectedPrice,
                  currency: "USD",
                },
              },
            }
          : {}),
      },
    });

    logInfo("candidate_processed", {
      candidateId: candidate.id,
      status,
      fingerprint,
    });

    return candidate;
  }

  private async persistHeldEbayCandidate(input: {
    scanId: string;
    keyword: string;
    ebay: EbayListing;
    fingerprint: string;
    snapshot: ProductResearchSnapshot;
    activeListingCount?: number | null;
    avgCompletedSaleMinor?: number;
    medianCompletedSaleMinor?: number;
  }) {
    const status = candidateStatusFromSnapshot(input.snapshot, false);
    const demandVerified =
      input.snapshot.ebay.sold30d != null && !input.snapshot.rejectIds.includes("EBAY_SOLD_HISTORY_UNAVAILABLE");
    return prisma.productCandidate.create({
      data: {
        scanId: input.scanId,
        fingerprint: input.fingerprint,
        status,
        productName: input.ebay.title,
        imageUrl: input.ebay.imageUrl,
        searchKeyword: input.keyword,
        ebayItemId: input.ebay.itemId,
        ebayUrl: input.ebay.url,
        ebayCurrentPriceMinor: input.snapshot.ebay.expectedSellingPrice,
        avgCompletedSaleMinor: input.avgCompletedSaleMinor,
        medianCompletedSaleMinor: input.medianCompletedSaleMinor,
        soldLast30Days: input.snapshot.ebay.sold30d ?? undefined,
        activeListingCount: input.activeListingCount && input.activeListingCount > 0 ? input.activeListingCount : null,
        rejectionReasonsJson: JSON.stringify(input.snapshot.rejectIds),
        demandVerified,
        opportunityScore: input.snapshot.opportunityScore,
        classification: input.snapshot.classification,
        researchSnapshotJson: JSON.stringify(input.snapshot),
        dataSource: input.ebay.meta.source,
        lastVerifiedAt: new Date(),
        ebayListings: {
          create: {
            itemId: input.ebay.itemId,
            title: input.ebay.title,
            url: input.ebay.url,
            imageUrl: input.ebay.imageUrl,
            priceMinor: input.ebay.priceMinor,
            shippingMinor: input.ebay.shippingMinor,
            currency: input.ebay.currency,
            condition: input.ebay.condition,
            sellerUsername: input.ebay.sellerUsername,
            sellerLocation: input.ebay.sellerLocation,
            categoryId: input.ebay.categoryId,
            rawJson: JSON.stringify(input.ebay),
          },
        },
        rejectionReasons: {
          create: input.snapshot.rejectIds.map((code) => ({ code })),
        },
      },
    });
  }

  /**
   * eBay-first path: qualify demand and economics, then find an AliExpress source.
   */
  private async processEbaySeededProduct(
    scanId: string,
    keyword: string,
    ebay: EbayListing,
    opts?: {
      activeListingCount?: number | null;
      priceMinMinor?: number | null;
      priceMaxMinor?: number | null;
      priceMedianMinor?: number | null;
      sellerCount?: number | null;
      topSellerListingShare?: number | null;
    },
  ) {
    const fingerprint = candidateFingerprint({
      ebayItemId: ebay.itemId,
      title: ebay.title,
    });

    const demand = await this.deps.ebay.getMarketDemand({
      keyword: ebay.title,
      itemId: ebay.itemId,
    });
    const gate = qualifyEbaySide({
      ebayItemId: ebay.itemId,
      ebayTitle: ebay.title,
      categoryId: ebay.categoryId,
      listingPriceMinor: ebay.priceMinor,
      priceMinMinor: opts?.priceMinMinor,
      priceMaxMinor: opts?.priceMaxMinor,
      priceMedianMinor: opts?.priceMedianMinor,
      medianCompletedSaleMinor: demand.medianCompletedSaleMinor,
      avgCompletedSaleMinor: demand.avgCompletedSaleMinor,
      demandAvailable: demand.available,
      demandSource: demand.source,
      sales: {
        sold7d: demand.sold7d ?? null,
        sold30d: demand.soldLast30Days ?? null,
        sold90d: demand.sold90d ?? null,
        sold365d: demand.sold365d ?? null,
      },
      activeListingCount: opts?.activeListingCount,
      sellerCount: opts?.sellerCount,
      topSellerListingShare: opts?.topSellerListingShare,
      rules: this.rules,
    });

    if (!gate.proceed) {
      return this.persistHeldEbayCandidate({
        scanId,
        keyword,
        ebay,
        fingerprint,
        snapshot: gate.snapshot,
        activeListingCount: opts?.activeListingCount,
        avgCompletedSaleMinor: demand.avgCompletedSaleMinor,
        medianCompletedSaleMinor: demand.medianCompletedSaleMinor,
      });
    }

    const expectedPrice = gate.expectedSellingPriceMinor;
    const maxSupplierCost = gate.maxAcceptableSupplierCostMinor;

    let status: CandidateStatus = "COLLECTING";
    const rejectionCodes: string[] = [];

    const sourceSearch = await this.searchAliExpressSources(ebay.title, keyword, ebay.imageUrl);
    const aeQuery = sourceSearch.primaryQuery;
    const aeResults = sourceSearch.products;
    const imageProductIds = new Set(sourceSearch.imageProductIds);

    const rankedText = rankAliExpressSources({
      ebay: {
        title: ebay.title,
        packQuantity: null,
        condition: ebay.condition ?? "NEW",
        categoryId: ebay.categoryId,
        priceMinor: expectedPrice,
      },
      candidates: aeResults,
      searchKeyword: aeQuery,
      rules: this.rules,
    });

    const priceEligibleSources = rankedText.filter(({ product }) => {
      if (!isKnownShippingCost(product.shippingMinor)) {
        return product.priceMinor <= maxSupplierCost;
      }
      return product.priceMinor + product.shippingMinor <= maxSupplierCost;
    });
    const profitableSources = priceEligibleSources.filter(({ product }) => {
      if (!isKnownShippingCost(product.shippingMinor)) return true;
      const profit = calculateProfit({
        aliexpressItemPriceMinor: product.priceMinor,
        aliexpressShippingCostMinor: product.shippingMinor,
        additionalSourcingCostMinor: this.rules.additionalSourcingCostMinor,
        expectedSellingPriceMinor: expectedPrice,
        ebayFeeRate: this.rules.ebayFeeRate,
        promotedListingRate: this.rules.promotedListingRate,
        expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
        expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
        otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
        otherPercentageCost: this.rules.otherPercentageCost,
      });
      return profit.profitMarginPercent >= this.rules.minimumNetMarginPercent;
    });
    const knownShippingProfitable = profitableSources.filter(({ product }) => isKnownShippingCost(product.shippingMinor));
    const shortlist = (knownShippingProfitable.length > 0 ? knownShippingProfitable : profitableSources).slice(0, 20);
    let rankedSources = shortlist;
    let visualAttempted = false;
    let visualAvailableCount = 0;
    if (this.deps.visualMatch && shortlist.length > 0) {
      visualAttempted = true;
      const visuals = [];
      for (const entry of shortlist) {
        if (!ebay.imageUrl || !entry.product.imageUrl) {
          visuals.push({
            productId: entry.product.productId,
            score: 0,
            similarity: 0,
            available: false,
          });
          continue;
        }
        const comparison = await this.deps.visualMatch.compareImages(ebay.imageUrl, entry.product.imageUrl);
        if (comparison.available) {
          visualAvailableCount += 1;
        } else {
          logWarn("visual_match_unavailable", {
            provider: this.deps.visualMatch.name,
            productId: entry.product.productId,
            reason: comparison.reason,
          });
        }
        visuals.push({
          productId: entry.product.productId,
          score: comparison.score,
          similarity: comparison.similarity,
          available: comparison.available,
        });
      }
      rankedSources = applyVisualScoresToRankedSources(shortlist, visuals, {
        visualFloor: DEFAULT_VISUAL_MATCH_FLOOR,
        ebayPriceMinor: ebay.priceMinor,
        requireVisual: visualAvailableCount > 0,
      });
    }

    const selectedSource = rankedSources[0];
    const selectedAe = selectedSource?.product;
    const topConfidence = selectedSource?.combinedConfidence ?? selectedSource?.match.confidence ?? 0;
    const shipping = selectedAe?.shippingMinor;
    const shippingKnown = isKnownShippingCost(shipping);

    const supplierInput: SupplierQualificationInput | null = selectedAe
      ? {
          productId: selectedAe.productId,
          title: selectedAe.title,
          rating: selectedAe.rating,
          reviewCount: selectedAe.reviewCount,
          orderCount: selectedAe.orderCount,
          priceMinor: selectedAe.priceMinor,
          shippingMinor: selectedAe.shippingMinor,
          matchConfidence: topConfidence,
          matchHardReject: Boolean(selectedSource?.match.hardReject),
          matchRejectReasons: selectedSource?.match.hardReject ? selectedSource.match.reasons : [],
        }
      : null;

    let snapshot = finalizeProductIntelligence(gate, supplierInput);
    if (!selectedSource && rankedText.length > 0 && priceEligibleSources.length === 0) {
      snapshot = {
        ...snapshot,
        status: "rejected",
        classification: "reject",
        opportunityScore: null,
        rejectIds: ["SUPPLIER_COST_ABOVE_MAX"],
        rejectReasons: ["Every retrieved AliExpress price is above the maximum acceptable supplier cost."],
      };
    } else if (!selectedSource && priceEligibleSources.length > 0 && profitableSources.length === 0) {
      snapshot = {
        ...snapshot,
        status: "rejected",
        classification: "reject",
        opportunityScore: null,
        rejectIds: ["MARGIN_TOO_LOW"],
        rejectReasons: ["Retrieved sources do not clear the minimum net margin."],
      };
    } else if (selectedSource?.visualAvailable && (selectedSource.visualScore ?? 0) < DEFAULT_VISUAL_MATCH_FLOOR) {
      snapshot = {
        ...snapshot,
        status: "rejected",
        classification: "reject",
        opportunityScore: null,
        rejectIds: ["VISUAL_MATCH_TOO_LOW"],
        rejectReasons: ["Visual similarity is below the floor."],
      };
    } else if (selectedSource && visualAttempted && visualAvailableCount === 0 && snapshot.status === "qualified") {
      snapshot = {
        ...snapshot,
        warnings: [...snapshot.warnings, "VISUAL_MATCH_UNAVAILABLE"],
      };
    }

    status = candidateStatusFromSnapshot(snapshot, shippingKnown);
    if (snapshot.warnings.includes("VISUAL_MATCH_UNAVAILABLE") && status === "APPROVED") {
      status = "NEEDS_MANUAL_VALIDATION";
    }
    rejectionCodes.push(...snapshot.rejectIds);

    const demandVerified = snapshot.ebay.sold30d != null && !snapshot.rejectIds.includes("EBAY_SOLD_HISTORY_UNAVAILABLE");
    const soldLast30Days = snapshot.ebay.sold30d ?? undefined;
    const avgCompleted = demand.avgCompletedSaleMinor;
    const profit =
      selectedAe && shippingKnown
        ? calculateProfit({
            aliexpressItemPriceMinor: selectedAe.priceMinor,
            aliexpressShippingCostMinor: shipping,
            additionalSourcingCostMinor: this.rules.additionalSourcingCostMinor,
            expectedSellingPriceMinor: expectedPrice,
            ebayFeeRate: this.rules.ebayFeeRate,
            promotedListingRate: this.rules.promotedListingRate,
            expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
            expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
            otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
            otherPercentageCost: this.rules.otherPercentageCost,
          })
        : null;

    const matchConfidence = snapshot.matchConfidence ?? (selectedAe ? topConfidence : undefined);
    const activeListingCount = opts?.activeListingCount && opts.activeListingCount > 0 ? opts.activeListingCount : null;
    const alternativeSources = aeResults
      .map((product) => {
        const match = scoreAliExpressSourceMatch(
          {
            title: ebay.title,
            packQuantity: null,
            condition: ebay.condition ?? "NEW",
            categoryId: ebay.categoryId,
            priceMinor: ebay.priceMinor,
          },
          { title: product.title, condition: "NEW", priceMinor: product.priceMinor },
          aeQuery,
        );
        const qualification = qualifyAliExpressProduct(product, this.rules);
        const titleRelevance = Math.round(jaccardSimilarity(tokenSet(ebay.title), tokenSet(product.title)) * 100);
        const retrievalMode = imageProductIds.has(product.productId) ? "image" : "keyword";
        return { product, match, qualification, titleRelevance, retrievalMode };
      })
      .sort((a, b) => {
        if (a.product.productId === selectedAe?.productId) return -1;
        if (b.product.productId === selectedAe?.productId) return 1;
        const aForm = a.match.reasons.includes("form_factor_match") ? 1 : 0;
        const bForm = b.match.reasons.includes("form_factor_match") ? 1 : 0;
        return bForm - aForm || b.titleRelevance - a.titleRelevance || b.match.confidence - a.match.confidence;
      })
      .slice(0, 5);

    const candidate = await prisma.productCandidate.create({
      data: {
        scanId,
        fingerprint,
        status,
        productName: ebay.title,
        imageUrl: ebay.imageUrl ?? selectedAe?.imageUrl,
        searchKeyword: keyword,
        aliexpressProductId: selectedAe?.productId,
        aliexpressUrl: selectedAe?.url,
        aliexpressPriceMinor: selectedAe?.priceMinor,
        aliexpressShippingMinor: selectedAe ? (shipping ?? null) : null,
        adjustedSourceCostMinor: profit?.adjustedSourceCostMinor ?? null,
        rating: selectedAe?.rating,
        reviewCount: selectedAe?.reviewCount,
        orderCount: selectedAe?.orderCount,
        ebayItemId: ebay.itemId,
        ebayUrl: ebay.url,
        ebayCurrentPriceMinor: expectedPrice,
        avgCompletedSaleMinor: avgCompleted,
        medianCompletedSaleMinor: demand.medianCompletedSaleMinor,
        soldLast30Days,
        activeListingCount,
        matchConfidence,
        estimatedProfitMinor: profit?.estimatedProfitMinor ?? snapshot.economics.estimatedNetProfit,
        netMarginPercent: profit?.profitMarginPercent ?? snapshot.economics.estimatedMargin,
        returnOnCostPercent: profit?.returnOnCostPercent ?? null,
        rejectionReasonsJson: JSON.stringify(rejectionCodes),
        demandVerified,
        opportunityScore: snapshot.opportunityScore,
        classification: snapshot.classification,
        researchSnapshotJson: JSON.stringify(snapshot),
        dataSource: ebay.meta.source,
        lastVerifiedAt: new Date(),
        ebayListings: {
          create: {
            itemId: ebay.itemId,
            title: ebay.title,
            url: ebay.url,
            imageUrl: ebay.imageUrl,
            priceMinor: ebay.priceMinor,
            shippingMinor: ebay.shippingMinor,
            currency: ebay.currency,
            condition: ebay.condition,
            sellerUsername: ebay.sellerUsername,
            sellerLocation: ebay.sellerLocation,
            categoryId: ebay.categoryId,
            rawJson: JSON.stringify(ebay),
          },
        },
        sourceProducts: {
          create: [
            {
              marketplace: "ebay",
              externalId: ebay.itemId,
              url: ebay.url,
              rawJson: JSON.stringify(ebay),
              confidence: ebay.meta.confidence,
              completeness: ebay.meta.completeness,
              warningsJson: JSON.stringify(ebay.meta.warnings),
            },
            ...alternativeSources.map(({ product, match, qualification, titleRelevance, retrievalMode }) => ({
              marketplace: "aliexpress_alternative",
              externalId: product.productId,
              url: product.url,
              rawJson: JSON.stringify({
                product,
                evaluation: {
                  match,
                  qualification,
                  titleRelevance,
                  retrievalMode,
                  selected: product.productId === selectedAe?.productId,
                },
              }),
              confidence: match.confidence / 100,
              completeness: product.meta.completeness,
              warningsJson: JSON.stringify([
                ...match.reasons,
                ...qualification.reasons,
                ...qualification.missingFields.map((field) => `MISSING_${field.toUpperCase()}`),
              ]),
            })),
          ],
        },
        ...(selectedAe
          ? {
              aliexpressProducts: {
                create: {
                  productId: selectedAe.productId,
                  title: selectedAe.title,
                  url: selectedAe.url,
                  imageUrl: selectedAe.imageUrl,
                  priceMinor: selectedAe.priceMinor,
                  shippingMinor: shipping,
                  currency: selectedAe.currency,
                  rating: selectedAe.rating,
                  reviewCount: selectedAe.reviewCount,
                  orderCount: selectedAe.orderCount,
                  rawJson: JSON.stringify(selectedAe),
                },
              },
              matches: {
                create: {
                  ebayItemId: ebay.itemId,
                  confidence: matchConfidence ?? 0,
                  reasonsJson: JSON.stringify({
                    aeTitle: selectedAe.title,
                    direction: "ebay_to_ae",
                    sourceRankScore: selectedSource?.rankScore,
                    reasons: selectedSource?.match.reasons,
                    evaluatedSources: aeResults.length,
                    qualifiedSources: rankedSources.length,
                    searchQueries: sourceSearch.queries,
                    imageSearchAttempted: sourceSearch.imageSearchAttempted,
                    imageSearchError: sourceSearch.imageSearchError,
                    retrievedByImage: imageProductIds.has(selectedAe.productId),
                    textConfidence: selectedSource?.match.confidence,
                    visualScore: selectedSource?.visualScore,
                    visualSimilarity: selectedSource?.visualSimilarity,
                    visualAvailable: selectedSource?.visualAvailable,
                    combinedConfidence: selectedSource?.combinedConfidence,
                    shippingKnown,
                  }),
                },
              },
              ...(profit
                ? {
                    profitCalculations: {
                      create: {
                        expectedSellingPriceMinor: expectedPrice,
                        grossRevenueMinor: profit.grossRevenueMinor,
                        adjustedSourceCostMinor: profit.adjustedSourceCostMinor,
                        marketplaceFeesMinor: profit.marketplaceFeesMinor,
                        promotedListingFeeMinor: profit.promotedListingFeeMinor,
                        expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
                        expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
                        otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
                        totalEstimatedCostMinor: profit.totalEstimatedCostMinor,
                        estimatedProfitMinor: profit.estimatedProfitMinor,
                        profitMarginPercent: profit.profitMarginPercent,
                        returnOnCostPercent: profit.returnOnCostPercent,
                        assumptionsJson: JSON.stringify(this.rules),
                      },
                    },
                  }
                : {}),
            }
          : {}),
        rejectionReasons: {
          create: rejectionCodes.map((code) => ({ code })),
        },
      },
    });

    logInfo("ebay_seeded_candidate_processed", {
      candidateId: candidate.id,
      status,
      fingerprint,
    });

    return candidate;
  }

  private async searchAliExpressSources(title: string, keyword: string, imageUrl?: string) {
    const queries = buildAliExpressSearchQueries(title, keyword);
    const products = new Map<string, AliExpressProduct>();
    const imageProductIds = new Set<string>();
    let imageSearchAttempted = false;
    let imageSearchError: string | undefined;

    if (process.env.ALIEXPRESS_IMAGE_SEARCH_ENABLED === "true" && imageUrl && this.deps.aliexpress.searchProductsByImage) {
      imageSearchAttempted = true;
      try {
        const imageResults = await this.deps.aliexpress.searchProductsByImage({
          imageUrl,
          limit: 50,
          shipToCountry: "US",
          currency: "USD",
        });
        for (const product of imageResults) {
          products.set(product.productId, product);
          imageProductIds.add(product.productId);
        }
      } catch (error) {
        imageSearchError = error instanceof Error ? error.message : String(error);
        logWarn("aliexpress_image_search_unavailable", { reason: imageSearchError });
      }
    }

    for (const query of queries) {
      const results = await this.deps.aliexpress.searchProducts({
        keyword: query,
        limit: 75,
      });
      for (const product of results) products.set(product.productId, product);

      if (process.env.ALIEXPRESS_HOTPRODUCT_ENABLED !== "false" && this.deps.aliexpress.searchHotProducts) {
        try {
          const hot = await this.deps.aliexpress.searchHotProducts({
            keyword: query,
            limit: 25,
            shipToCountry: "US",
            currency: "USD",
          });
          for (const product of hot) products.set(product.productId, product);
        } catch (error) {
          logWarn("aliexpress_hotproduct_unavailable", {
            query,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (process.env.ALIEXPRESS_SMARTMATCH_ENABLED !== "false" && this.deps.aliexpress.searchSmartMatch) {
      const smartQueries = [queries[0], keyword].filter((q): q is string => Boolean(q));
      for (const smartQuery of [...new Set(smartQueries)]) {
        try {
          const smart = await this.deps.aliexpress.searchSmartMatch({
            keywords: smartQuery,
            limit: 20,
            shipToCountry: "US",
            currency: "USD",
          });
          for (const product of smart) products.set(product.productId, product);
        } catch (error) {
          logWarn("aliexpress_smartmatch_unavailable", {
            query: smartQuery,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return {
      primaryQuery: queries[0] ?? keyword,
      queries,
      products: [...products.values()].slice(0, 300),
      imageProductIds: [...imageProductIds],
      imageSearchAttempted,
      imageSearchError,
    };
  }

  private async resumeSupplierAfterDemand(
    candidate: {
      id: string;
      scanId: string;
      productName: string;
      imageUrl: string | null;
      searchKeyword: string | null;
      ebayItemId: string | null;
      ebayUrl: string | null;
      ebayCurrentPriceMinor: number | null;
      activeListingCount: number | null;
    },
    observation: {
      soldLast30Days: number;
      avgCompletedSaleMinor?: number;
      medianCompletedSaleMinor?: number;
      notes?: string;
      verifiedBy?: string;
    },
  ) {
    const priceMinor = candidate.ebayCurrentPriceMinor ?? 0;
    const ebay: EbayListing = {
      itemId: candidate.ebayItemId ?? "",
      title: candidate.productName,
      url: candidate.ebayUrl ?? "",
      imageUrl: candidate.imageUrl ?? undefined,
      priceMinor,
      currency: "USD",
      condition: "NEW",
      meta: {
        source: "manual_resume",
        confidence: 1,
        collectedAt: new Date().toISOString(),
        completeness: "partial",
        warnings: [],
      },
    };
    if (!ebay.itemId) {
      throw new Error("Cannot match supplier: candidate has no eBay item id");
    }

    const gate = qualifyEbaySide({
      ebayItemId: ebay.itemId,
      ebayTitle: ebay.title,
      listingPriceMinor: priceMinor,
      medianCompletedSaleMinor: observation.medianCompletedSaleMinor,
      avgCompletedSaleMinor: observation.avgCompletedSaleMinor,
      demandAvailable: true,
      demandSource: "manual",
      sales: { sold7d: null, sold30d: observation.soldLast30Days, sold90d: null, sold365d: null },
      activeListingCount: candidate.activeListingCount,
      rules: this.rules,
    });
    if (!gate.proceed) {
      const status = candidateStatusFromSnapshot(gate.snapshot, false);
      const updated = await prisma.productCandidate.update({
        where: { id: candidate.id },
        data: {
          status,
          demandVerified: true,
          soldLast30Days: observation.soldLast30Days,
          avgCompletedSaleMinor: observation.avgCompletedSaleMinor,
          medianCompletedSaleMinor: observation.medianCompletedSaleMinor,
          ebayCurrentPriceMinor: gate.expectedSellingPriceMinor,
          opportunityScore: gate.snapshot.opportunityScore,
          classification: gate.snapshot.classification,
          researchSnapshotJson: JSON.stringify(gate.snapshot),
          rejectionReasonsJson: JSON.stringify(gate.snapshot.rejectIds),
          lastVerifiedAt: new Date(),
        },
      });
      await this.syncIdeaIntelligence(candidate.id, gate.snapshot, status, observation.soldLast30Days);
      return updated;
    }

    const sourceSearch = await this.searchAliExpressSources(ebay.title, candidate.searchKeyword ?? ebay.title, ebay.imageUrl);
    const ranked = rankAliExpressSources({
      ebay: { title: ebay.title, packQuantity: null, condition: "NEW", priceMinor: gate.expectedSellingPriceMinor },
      candidates: sourceSearch.products,
      searchKeyword: sourceSearch.primaryQuery,
      rules: this.rules,
    });
    const affordable = ranked.filter(({ product }) => {
      if (!isKnownShippingCost(product.shippingMinor)) return product.priceMinor <= gate.maxAcceptableSupplierCostMinor;
      return product.priceMinor + product.shippingMinor <= gate.maxAcceptableSupplierCostMinor;
    });
    let selected = affordable[0];
    if (this.deps.visualMatch && affordable.length > 0 && ebay.imageUrl) {
      const visuals = [];
      for (const entry of affordable.slice(0, 20)) {
        if (!entry.product.imageUrl) {
          visuals.push({ productId: entry.product.productId, score: 0, similarity: 0, available: false });
          continue;
        }
        const comparison = await this.deps.visualMatch.compareImages(ebay.imageUrl, entry.product.imageUrl);
        visuals.push({
          productId: entry.product.productId,
          score: comparison.score,
          similarity: comparison.similarity,
          available: comparison.available,
        });
      }
      const reranked = applyVisualScoresToRankedSources(affordable.slice(0, 20), visuals, {
        visualFloor: DEFAULT_VISUAL_MATCH_FLOOR,
        ebayPriceMinor: gate.expectedSellingPriceMinor,
        requireVisual: visuals.some((visual) => visual.available),
      });
      selected = reranked[0];
    }

    const selectedAe = selected?.product;
    const confidence = selected?.combinedConfidence ?? selected?.match.confidence ?? 0;
    const snapshot = finalizeProductIntelligence(
      gate,
      selectedAe
        ? {
            productId: selectedAe.productId,
            title: selectedAe.title,
            rating: selectedAe.rating,
            reviewCount: selectedAe.reviewCount,
            orderCount: selectedAe.orderCount,
            priceMinor: selectedAe.priceMinor,
            shippingMinor: selectedAe.shippingMinor,
            matchConfidence: confidence,
            matchHardReject: selected.match.hardReject,
            matchRejectReasons: selected.match.hardReject ? selected.match.reasons : [],
          }
        : null,
    );
    const shippingCost = selectedAe && isKnownShippingCost(selectedAe.shippingMinor) ? selectedAe.shippingMinor : null;
    const status = candidateStatusFromSnapshot(snapshot, shippingCost != null);
    const profit =
      selectedAe && shippingCost != null
        ? calculateProfit({
            aliexpressItemPriceMinor: selectedAe.priceMinor,
            aliexpressShippingCostMinor: shippingCost,
            additionalSourcingCostMinor: this.rules.additionalSourcingCostMinor,
            expectedSellingPriceMinor: gate.expectedSellingPriceMinor,
            ebayFeeRate: this.rules.ebayFeeRate,
            promotedListingRate: this.rules.promotedListingRate,
            expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
            expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
            otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
            otherPercentageCost: this.rules.otherPercentageCost,
          })
        : null;

    const updated = await prisma.productCandidate.update({
      where: { id: candidate.id },
      data: {
        status,
        demandVerified: true,
        soldLast30Days: observation.soldLast30Days,
        avgCompletedSaleMinor: observation.avgCompletedSaleMinor,
        medianCompletedSaleMinor: observation.medianCompletedSaleMinor,
        ebayCurrentPriceMinor: gate.expectedSellingPriceMinor,
        aliexpressProductId: selectedAe?.productId,
        aliexpressUrl: selectedAe?.url,
        aliexpressPriceMinor: selectedAe?.priceMinor,
        aliexpressShippingMinor: selectedAe ? (selectedAe.shippingMinor ?? null) : null,
        rating: selectedAe?.rating,
        reviewCount: selectedAe?.reviewCount,
        orderCount: selectedAe?.orderCount,
        matchConfidence: snapshot.matchConfidence ?? (selectedAe ? confidence : null),
        adjustedSourceCostMinor: profit?.adjustedSourceCostMinor ?? null,
        estimatedProfitMinor: profit?.estimatedProfitMinor ?? null,
        netMarginPercent: profit?.profitMarginPercent ?? null,
        returnOnCostPercent: profit?.returnOnCostPercent ?? null,
        opportunityScore: snapshot.opportunityScore,
        classification: snapshot.classification,
        researchSnapshotJson: JSON.stringify(snapshot),
        rejectionReasonsJson: JSON.stringify(snapshot.rejectIds),
        lastVerifiedAt: new Date(),
        ...(selectedAe
          ? {
              aliexpressProducts: {
                create: {
                  productId: selectedAe.productId,
                  title: selectedAe.title,
                  url: selectedAe.url,
                  imageUrl: selectedAe.imageUrl,
                  priceMinor: selectedAe.priceMinor,
                  shippingMinor: selectedAe.shippingMinor,
                  currency: selectedAe.currency,
                  rating: selectedAe.rating,
                  reviewCount: selectedAe.reviewCount,
                  orderCount: selectedAe.orderCount,
                  rawJson: JSON.stringify(selectedAe),
                },
              },
            }
          : {}),
      },
    });
    await this.syncIdeaIntelligence(candidate.id, snapshot, status, observation.soldLast30Days);
    return updated;
  }

  private async syncIdeaIntelligence(
    candidateId: string,
    snapshot: ProductResearchSnapshot,
    status: CandidateStatus,
    soldLast30Days: number,
  ) {
    const ideaStatus =
      !snapshot.supplier && status === "NEEDS_MANUAL_VALIDATION"
        ? "NEEDS_EVIDENCE"
        : snapshot.classification === "strong_candidate" && status === "APPROVED"
          ? "AE_MATCHED"
          : "REJECTED";
    await prisma.trendIdea.updateMany({
      where: { productCandidateId: candidateId },
      data: {
        status: ideaStatus,
        soldLast30Days,
        opportunityScore: snapshot.opportunityScore,
        classification: snapshot.classification,
        researchSnapshotJson: JSON.stringify(snapshot),
        rejectionReasonsJson: JSON.stringify(snapshot.rejectIds),
      },
    });
  }

  async applyManualDemand(
    candidateId: string,
    observation: {
      soldLast30Days: number;
      avgCompletedSaleMinor?: number;
      medianCompletedSaleMinor?: number;
      evidenceUrl?: string;
      verifiedBy?: string;
      notes?: string;
    },
  ) {
    const candidate = await prisma.productCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      include: { profitCalculations: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (
      !candidate.aliexpressProductId ||
      !candidate.aliexpressUrl ||
      candidate.aliexpressPriceMinor == null ||
      candidate.matchConfidence == null
    ) {
      await prisma.ebaySaleObservation.create({
        data: {
          candidateId,
          source: "EbayManualDemandProvider",
          soldLast30Days: observation.soldLast30Days,
          avgPriceMinor: observation.avgCompletedSaleMinor,
          medianPriceMinor: observation.medianCompletedSaleMinor,
          evidenceUrl: observation.evidenceUrl,
          notes: observation.notes,
          verifiedBy: observation.verifiedBy ?? "operator",
        },
      });
      return this.resumeSupplierAfterDemand(candidate, observation);
    }

    await prisma.ebaySaleObservation.create({
      data: {
        candidateId,
        source: "EbayManualDemandProvider",
        soldLast30Days: observation.soldLast30Days,
        avgPriceMinor: observation.avgCompletedSaleMinor,
        medianPriceMinor: observation.medianCompletedSaleMinor,
        evidenceUrl: observation.evidenceUrl,
        notes: observation.notes,
        verifiedBy: observation.verifiedBy ?? "operator",
      },
    });

    const expectedPrice = observation.avgCompletedSaleMinor ?? observation.medianCompletedSaleMinor ?? candidate.ebayCurrentPriceMinor ?? 0;
    const shipping = candidate.aliexpressShippingMinor;
    const shippingKnown = isKnownShippingCost(shipping);
    const profit = isKnownShippingCost(shipping)
      ? calculateProfit({
          aliexpressItemPriceMinor: candidate.aliexpressPriceMinor,
          aliexpressShippingCostMinor: shipping,
          additionalSourcingCostMinor: this.rules.additionalSourcingCostMinor,
          expectedSellingPriceMinor: expectedPrice,
          ebayFeeRate: this.rules.ebayFeeRate,
          promotedListingRate: this.rules.promotedListingRate,
          expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
          expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
          otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
          otherPercentageCost: this.rules.otherPercentageCost,
        })
      : null;

    const gate = qualifyEbaySide({
      ebayItemId: candidate.ebayItemId ?? candidate.id,
      ebayTitle: candidate.productName,
      listingPriceMinor: expectedPrice,
      medianCompletedSaleMinor: observation.medianCompletedSaleMinor,
      avgCompletedSaleMinor: observation.avgCompletedSaleMinor,
      demandAvailable: true,
      demandSource: "manual",
      sales: { sold7d: null, sold30d: observation.soldLast30Days, sold90d: null, sold365d: null },
      activeListingCount: candidate.activeListingCount,
      rules: this.rules,
    });
    const snapshot = finalizeProductIntelligence(gate, {
      productId: candidate.aliexpressProductId,
      title: candidate.productName,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      orderCount: candidate.orderCount,
      priceMinor: candidate.aliexpressPriceMinor,
      shippingMinor: candidate.aliexpressShippingMinor,
      matchConfidence: candidate.matchConfidence ?? 0,
      matchHardReject: false,
      matchRejectReasons: [],
    });
    const status = candidateStatusFromSnapshot(snapshot, shippingKnown);
    const rejectionCodes = snapshot.rejectIds;

    const updated = await prisma.productCandidate.update({
      where: { id: candidateId },
      data: {
        status,
        demandVerified: true,
        soldLast30Days: observation.soldLast30Days,
        avgCompletedSaleMinor: observation.avgCompletedSaleMinor,
        medianCompletedSaleMinor: observation.medianCompletedSaleMinor,
        estimatedProfitMinor: profit?.estimatedProfitMinor ?? null,
        netMarginPercent: profit?.profitMarginPercent ?? null,
        returnOnCostPercent: profit?.returnOnCostPercent ?? null,
        adjustedSourceCostMinor: profit?.adjustedSourceCostMinor ?? null,
        rejectionReasonsJson: JSON.stringify(rejectionCodes),
        opportunityScore: snapshot.opportunityScore,
        classification: snapshot.classification,
        researchSnapshotJson: JSON.stringify(snapshot),
        lastVerifiedAt: new Date(),
        ...(profit
          ? {
              profitCalculations: {
                create: {
                  expectedSellingPriceMinor: expectedPrice,
                  grossRevenueMinor: profit.grossRevenueMinor,
                  adjustedSourceCostMinor: profit.adjustedSourceCostMinor,
                  marketplaceFeesMinor: profit.marketplaceFeesMinor,
                  promotedListingFeeMinor: profit.promotedListingFeeMinor,
                  expectedReturnCostMinor: this.rules.expectedReturnCostMinor,
                  expectedRefundCostMinor: this.rules.expectedRefundCostMinor,
                  otherFixedCostsMinor: this.rules.otherFixedCostsMinor,
                  totalEstimatedCostMinor: profit.totalEstimatedCostMinor,
                  estimatedProfitMinor: profit.estimatedProfitMinor,
                  profitMarginPercent: profit.profitMarginPercent,
                  returnOnCostPercent: profit.returnOnCostPercent,
                  assumptionsJson: JSON.stringify({ ...this.rules, demandSource: "manual" }),
                },
              },
            }
          : {}),
        manualReviews: {
          create: {
            action: "DEMAND_VALIDATED",
            notes: observation.notes,
            actor: observation.verifiedBy ?? "operator",
          },
        },
        rejectionReasons: {
          create: rejectionCodes.map((code) => ({ code })),
        },
      },
    });

    await this.syncIdeaIntelligence(candidateId, snapshot, status, observation.soldLast30Days);

    await prisma.auditLog.create({
      data: {
        scanId: candidate.scanId,
        action: "MANUAL_DEMAND_APPLIED",
        entityType: "ProductCandidate",
        entityId: candidateId,
        detailJson: JSON.stringify(observation),
      },
    });

    return updated;
  }

  async exportApproved(exporter: SpreadsheetExporter, options?: { candidateIds?: string[]; workspaceId?: string }) {
    const workspaceId = options?.workspaceId ?? this.deps.workspaceId;
    const approved = await prisma.productCandidate.findMany({
      where: {
        status: { in: ["APPROVED", "EXPORT_PENDING"] },
        aliexpressProductId: { not: null },
        aliexpressUrl: { not: null },
        aliexpressPriceMinor: { not: null },
        aliexpressShippingMinor: { not: null },
        ...(workspaceId ? { scan: { project: { workspaceId } } } : {}),
        ...(options?.candidateIds?.length ? { id: { in: options.candidateIds } } : {}),
      },
    });
    const rows: ExportCandidateRow[] = approved.map((c) => ({
      timestamp: new Date().toISOString(),
      scanId: c.scanId,
      searchKeyword: c.searchKeyword ?? "",
      productName: c.productName,
      productImage: c.imageUrl ?? "",
      aliexpressUrl: c.aliexpressUrl ?? "",
      aliexpressProductId: c.aliexpressProductId ?? "",
      aliexpressPrice: formatMinor(c.aliexpressPriceMinor ?? 0),
      aliexpressShipping: formatMinor(c.aliexpressShippingMinor ?? 0),
      adjustedSourceCost: formatMinor(c.adjustedSourceCostMinor ?? 0),
      rating: String(c.rating ?? ""),
      reviewCount: String(c.reviewCount ?? ""),
      orderCount: String(c.orderCount ?? ""),
      ebayUrl: c.ebayUrl ?? "",
      ebayItemId: c.ebayItemId ?? "",
      ebayCurrentPrice: formatMinor(c.ebayCurrentPriceMinor ?? 0),
      averageCompletedSalePrice: formatMinor(c.avgCompletedSaleMinor ?? 0),
      soldLast30Days: String(c.soldLast30Days ?? ""),
      activeListingCount: String(c.activeListingCount ?? ""),
      matchConfidence: String(c.matchConfidence ?? ""),
      estimatedMarketplaceFees: "",
      estimatedTotalCost: "",
      estimatedProfit: formatMinor(c.estimatedProfitMinor ?? 0),
      netMarginPercent: String(c.netMarginPercent?.toFixed(2) ?? ""),
      returnOnCostPercent: String(c.returnOnCostPercent?.toFixed(2) ?? ""),
      status: c.status,
      rejectionReason: c.rejectionReasonsJson ?? "",
      lastVerifiedTimestamp: c.lastVerifiedAt?.toISOString() ?? "",
      dataSource: c.dataSource ?? "",
      fingerprint: c.fingerprint,
    }));

    const result = await exporter.exportCandidates(rows);
    for (const c of approved) {
      await prisma.exportRecord.create({
        data: {
          candidateId: c.id,
          destination: exporter.name,
          status: result.success ? "SUCCESS" : "FAILED",
          spreadsheetId: result.spreadsheetId,
          rowRange: result.rowRange,
          error: result.error,
        },
      });
      if (result.success) {
        await prisma.productCandidate.update({
          where: { id: c.id },
          data: { status: "EXPORTED" },
        });
      }
    }
    if (!result.success) {
      logWarn("export_failed", { error: result.error });
    }
    return result;
  }
}

export function extractEbayItemId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed) || /^v1\|/.test(trimmed)) return trimmed;
  const fromPath = trimmed.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})/i);
  if (fromPath) return fromPath[1];
  try {
    const u = new URL(trimmed);
    const id = u.searchParams.get("item") ?? u.searchParams.get("id");
    if (id) return id;
  } catch {
    /* not a URL */
  }
  return null;
}
