import { prisma } from "@/lib/db";
import { calculateProfit, formatMinor } from "@/lib/domain/profit";
import { candidateFingerprint, scoreProductMatch } from "@/lib/domain/matching";
import { qualifyAliExpressProduct } from "@/lib/domain/qualification";
import {
  DEFAULT_RULES,
  type AliExpressProduct,
  type CandidateStatus,
  type QualificationRules,
  type RejectionCode,
} from "@/lib/domain/types";
import type { ExportCandidateRow } from "@/lib/export/types";
import { logInfo, logWarn } from "@/lib/logger";
import type { AliExpressProvider, EbayProvider, SpreadsheetExporter } from "@/lib/providers/types";

export interface ScanInput {
  keyword: string;
  mode?: "keyword" | "aliexpress_url" | "ebay_url" | "batch";
  limit?: number;
  projectName?: string;
  rules?: Partial<QualificationRules>;
  aliexpressUrl?: string;
}

export interface ScanOrchestratorDeps {
  aliexpress: AliExpressProvider;
  ebay: EbayProvider;
  exporter?: SpreadsheetExporter;
  rules?: QualificationRules;
}

export class ScanOrchestrator {
  private rules: QualificationRules;

  constructor(private readonly deps: ScanOrchestratorDeps) {
    this.rules = { ...DEFAULT_RULES, ...deps.rules };
  }

  async run(input: ScanInput) {
    const workspace = await this.ensureWorkspace();
    const project = await prisma.searchProject.create({
      data: {
        name: input.projectName ?? `Scan ${input.keyword}`,
        workspaceId: workspace.id,
        keywords: { create: [{ keyword: input.keyword }] },
      },
    });

    const scan = await prisma.scan.create({
      data: {
        projectId: project.id,
        keyword: input.keyword,
        mode: input.mode ?? "keyword",
        status: "RUNNING",
      },
    });

    await prisma.auditLog.create({
      data: {
        scanId: scan.id,
        action: "SCAN_STARTED",
        detailJson: JSON.stringify({ keyword: input.keyword, mode: input.mode }),
      },
    });

    const job = await prisma.scanJob.create({
      data: {
        scanId: scan.id,
        type: "FULL_RESEARCH",
        status: "RUNNING",
        attempts: 1,
        startedAt: new Date(),
        payloadJson: JSON.stringify(input),
      },
    });

    try {
      let aeProducts: AliExpressProduct[];
      if (input.aliexpressUrl) {
        aeProducts = [await this.deps.aliexpress.getProductDetails(input.aliexpressUrl)];
      } else {
        aeProducts = await this.deps.aliexpress.searchProducts({
          keyword: input.keyword,
          limit: input.limit ?? 5,
        });
      }

      const results = [];
      for (const ae of aeProducts.slice(0, input.limit ?? 5)) {
        results.push(await this.processAliExpressProduct(scan.id, input.keyword, ae));
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

  private async processAliExpressProduct(
    scanId: string,
    keyword: string,
    ae: AliExpressProduct,
  ) {
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
        status = "EBAY_MATCH_REQUIRED";
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

    if (status === "EBAY_MATCHED" && matchSnapshot) {
      const demand = await this.deps.ebay.getMarketDemand({
        keyword: ae.title,
        itemId: matchSnapshot.itemId,
      });
      if (!demand.available) {
        status = "NEEDS_MANUAL_VALIDATION";
        rejectionCodes.push(demand.reasonCode ?? "EBAY_SOLD_HISTORY_UNAVAILABLE");
      } else {
        demandVerified = true;
        soldLast30Days = demand.soldLast30Days;
        avgCompleted = demand.avgCompletedSaleMinor;
        if ((soldLast30Days ?? 0) < this.rules.minimumRecentSales) {
          status = "DEMAND_NOT_VERIFIED";
          rejectionCodes.push("EBAY_RECENT_SALES_TOO_LOW");
        }
      }
    }

    const shipping = ae.shippingMinor ?? 0;
    if (ae.shippingMinor == null && status !== "ALIEXPRESS_REJECTED") {
      rejectionCodes.push("MISSING_SHIPPING_COST");
    }

    const expectedPrice = matchSnapshot?.priceMinor ?? 0;
    const matchedItemId = matchSnapshot?.itemId;
    const matchedUrl = matchSnapshot?.url;
    const matchedConfidence = matchSnapshot?.confidence;
    const matchedTitle = matchSnapshot?.title;
    const profit = calculateProfit({
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
    });

    if (
      demandVerified &&
      status !== "DEMAND_NOT_VERIFIED" &&
      status !== "ALIEXPRESS_REJECTED" &&
      status !== "EBAY_MATCH_REQUIRED" &&
      status !== "NEEDS_MANUAL_VALIDATION"
    ) {
      if (profit.profitMarginPercent < this.rules.minimumNetMarginPercent) {
        status = "UNPROFITABLE";
        rejectionCodes.push("MARGIN_TOO_LOW");
      } else {
        status = "APPROVED";
      }
    }

    // Never approve without verified demand
    if (status === "APPROVED" && !demandVerified) {
      status = "NEEDS_MANUAL_VALIDATION";
      rejectionCodes.push("EBAY_SOLD_HISTORY_UNAVAILABLE");
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
        aliexpressShippingMinor: shipping,
        adjustedSourceCostMinor: profit.adjustedSourceCostMinor,
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
        estimatedProfitMinor: profit.estimatedProfitMinor,
        netMarginPercent: profit.profitMarginPercent,
        returnOnCostPercent: profit.returnOnCostPercent,
        rejectionReasonsJson: JSON.stringify(rejectionCodes),
        demandVerified,
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

    const rejectionCodes: RejectionCode[] = [];
    let status: CandidateStatus = "EBAY_MATCHED";

    if (observation.soldLast30Days < this.rules.minimumRecentSales) {
      status = "DEMAND_NOT_VERIFIED";
      rejectionCodes.push("EBAY_RECENT_SALES_TOO_LOW");
    } else {
      const margin = candidate.netMarginPercent ?? 0;
      if (margin < this.rules.minimumNetMarginPercent) {
        status = "UNPROFITABLE";
        rejectionCodes.push("MARGIN_TOO_LOW");
      } else {
        status = "APPROVED";
      }
    }

    const updated = await prisma.productCandidate.update({
      where: { id: candidateId },
      data: {
        status,
        demandVerified: true,
        soldLast30Days: observation.soldLast30Days,
        avgCompletedSaleMinor: observation.avgCompletedSaleMinor,
        medianCompletedSaleMinor: observation.medianCompletedSaleMinor,
        rejectionReasonsJson: JSON.stringify(rejectionCodes),
        lastVerifiedAt: new Date(),
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

  async exportApproved(exporter: SpreadsheetExporter) {
    const approved = await prisma.productCandidate.findMany({
      where: { status: { in: ["APPROVED", "EXPORT_PENDING"] } },
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

  private async ensureWorkspace() {
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { email: "operator@local.dev", name: "Local Operator" },
      });
    }
    let workspace = await prisma.workspace.findFirst({ where: { userId: user.id } });
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: "Default Workspace",
          userId: user.id,
          settings: { create: {} },
        },
      });
    }
    return workspace;
  }
}
