-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "minimumRating" DOUBLE PRECISION NOT NULL DEFAULT 4.7,
    "preferredRating" DOUBLE PRECISION NOT NULL DEFAULT 4.8,
    "idealRating" DOUBLE PRECISION NOT NULL DEFAULT 4.9,
    "minimumReviewCount" INTEGER NOT NULL DEFAULT 20,
    "preferredReviewCount" INTEGER NOT NULL DEFAULT 30,
    "minimumOrderCount" INTEGER NOT NULL DEFAULT 50,
    "preferredOrderCount" INTEGER NOT NULL DEFAULT 100,
    "minimumRecentSales" INTEGER NOT NULL DEFAULT 5,
    "minimumMatchConfidence" INTEGER NOT NULL DEFAULT 70,
    "minimumNetMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "preferredNetMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "additionalSourcingCostMinor" INTEGER NOT NULL DEFAULT 199,
    "ebayFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.1325,
    "promotedListingRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedReturnCostMinor" INTEGER NOT NULL DEFAULT 0,
    "expectedRefundCostMinor" INTEGER NOT NULL DEFAULT 0,
    "otherFixedCostsMinor" INTEGER NOT NULL DEFAULT 0,
    "otherPercentageCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "ebayMarketplace" TEXT NOT NULL DEFAULT 'EBAY_US',
    "shipToCountry" TEXT NOT NULL DEFAULT 'US',
    "scheduleCron" TEXT,
    "autoExportOnApproval" BOOLEAN NOT NULL DEFAULT false,
    "googleSpreadsheetId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchKeyword" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keyword" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanJob" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "deadLetter" BOOLEAN NOT NULL DEFAULT false,
    "payloadJson" TEXT,
    "resultJson" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCandidate" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "productName" TEXT NOT NULL,
    "imageUrl" TEXT,
    "searchKeyword" TEXT,
    "aliexpressProductId" TEXT,
    "aliexpressUrl" TEXT,
    "aliexpressPriceMinor" INTEGER,
    "aliexpressShippingMinor" INTEGER,
    "adjustedSourceCostMinor" INTEGER,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "orderCount" INTEGER,
    "ebayItemId" TEXT,
    "ebayUrl" TEXT,
    "ebayCurrentPriceMinor" INTEGER,
    "avgCompletedSaleMinor" INTEGER,
    "medianCompletedSaleMinor" INTEGER,
    "soldLast30Days" INTEGER,
    "activeListingCount" INTEGER,
    "matchConfidence" INTEGER,
    "estimatedProfitMinor" INTEGER,
    "netMarginPercent" DOUBLE PRECISION,
    "returnOnCostPercent" DOUBLE PRECISION,
    "rejectionReasonsJson" TEXT,
    "demandVerified" BOOLEAN NOT NULL DEFAULT false,
    "dataSource" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendResearchRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "keywordsJson" TEXT NOT NULL,
    "criteriaJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TrendResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendIdea" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ebayItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ebayUrl" TEXT,
    "imageUrl" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "categoryId" TEXT,
    "searchKeyword" TEXT,
    "clusterKey" TEXT NOT NULL,
    "activeListingCount" INTEGER NOT NULL DEFAULT 0,
    "priceMinMinor" INTEGER,
    "priceMaxMinor" INTEGER,
    "priceMedianMinor" INTEGER,
    "score" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "dataSource" TEXT NOT NULL DEFAULT 'ebay_browse_proxy',
    "productCandidateId" TEXT,
    "rejectionReasonsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendKeywordSnapshot" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL DEFAULT 'US',
    "version" TEXT NOT NULL,
    "researchedAt" TIMESTAMP(3) NOT NULL,
    "sourcesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendKeywordSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendKeyword" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "momentum" TEXT NOT NULL,
    "sourcesJson" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceProduct" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "rawJson" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION,
    "completeness" TEXT,
    "warningsJson" TEXT,

    CONSTRAINT "SourceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AliExpressProduct" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "imageUrl" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "shippingMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "orderCount" INTEGER,
    "rawJson" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AliExpressProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AliExpressVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "skuId" TEXT,
    "name" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "attrsJson" TEXT,

    CONSTRAINT "AliExpressVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbayListing" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "imageUrl" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "shippingMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "condition" TEXT,
    "sellerUsername" TEXT,
    "sellerLocation" TEXT,
    "categoryId" TEXT,
    "rawJson" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbayListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbaySaleObservation" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "soldLast30Days" INTEGER,
    "avgPriceMinor" INTEGER,
    "medianPriceMinor" INTEGER,
    "totalHistoricalSold" INTEGER,
    "evidenceUrl" TEXT,
    "notes" TEXT,
    "verifiedBy" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbaySaleObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMatch" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "ebayItemId" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reasonsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitCalculation" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "expectedSellingPriceMinor" INTEGER NOT NULL,
    "buyerShippingRevenueMinor" INTEGER NOT NULL DEFAULT 0,
    "grossRevenueMinor" INTEGER NOT NULL,
    "adjustedSourceCostMinor" INTEGER NOT NULL,
    "marketplaceFeesMinor" INTEGER NOT NULL,
    "promotedListingFeeMinor" INTEGER NOT NULL,
    "expectedReturnCostMinor" INTEGER NOT NULL,
    "expectedRefundCostMinor" INTEGER NOT NULL,
    "otherFixedCostsMinor" INTEGER NOT NULL,
    "totalEstimatedCostMinor" INTEGER NOT NULL,
    "estimatedProfitMinor" INTEGER NOT NULL,
    "profitMarginPercent" DOUBLE PRECISION NOT NULL,
    "returnOnCostPercent" DOUBLE PRECISION NOT NULL,
    "assumptionsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfitCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RejectionReason" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectionReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualReview" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportRecord" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "spreadsheetId" TEXT,
    "rowRange" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourceCredential" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSourceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourceHealthEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "metaJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSourceHealthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detailJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "projectId" TEXT,
    "keyword" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "configJson" TEXT NOT NULL,
    "capabilitiesJson" TEXT,
    "progressJson" TEXT,
    "summaryJson" TEXT,
    "error" TEXT,
    "trendRunId" TEXT,
    "scanId" TEXT,
    "exportResultJson" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationStageRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "progressCurrent" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationStageRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" TEXT,
    "kind" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationDecision" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "candidateId" TEXT,
    "ideaId" TEXT,
    "outcome" TEXT NOT NULL,
    "reasonsJson" TEXT,
    "evidenceJson" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSettings_workspaceId_key" ON "WorkspaceSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "ProductCandidate_fingerprint_idx" ON "ProductCandidate"("fingerprint");

-- CreateIndex
CREATE INDEX "ProductCandidate_status_idx" ON "ProductCandidate"("status");

-- CreateIndex
CREATE INDEX "TrendIdea_status_idx" ON "TrendIdea"("status");

-- CreateIndex
CREATE INDEX "TrendIdea_runId_idx" ON "TrendIdea"("runId");

-- CreateIndex
CREATE INDEX "TrendIdea_clusterKey_idx" ON "TrendIdea"("clusterKey");

-- CreateIndex
CREATE INDEX "TrendIdea_ebayItemId_idx" ON "TrendIdea"("ebayItemId");

-- CreateIndex
CREATE INDEX "TrendKeywordSnapshot_market_createdAt_idx" ON "TrendKeywordSnapshot"("market", "createdAt");

-- CreateIndex
CREATE INDEX "TrendKeyword_snapshotId_rank_idx" ON "TrendKeyword"("snapshotId", "rank");

-- CreateIndex
CREATE INDEX "TrendKeyword_snapshotId_niche_idx" ON "TrendKeyword"("snapshotId", "niche");

-- CreateIndex
CREATE INDEX "AutomationRun_status_createdAt_idx" ON "AutomationRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationStageRun_runId_position_idx" ON "AutomationStageRun"("runId", "position");

-- CreateIndex
CREATE INDEX "AutomationStageRun_runId_stage_idx" ON "AutomationStageRun"("runId", "stage");

-- CreateIndex
CREATE INDEX "AutomationStageRun_status_idx" ON "AutomationStageRun"("status");

-- CreateIndex
CREATE INDEX "AutomationArtifact_runId_kind_idx" ON "AutomationArtifact"("runId", "kind");

-- CreateIndex
CREATE INDEX "AutomationDecision_runId_outcome_idx" ON "AutomationDecision"("runId", "outcome");

-- CreateIndex
CREATE INDEX "AutomationDecision_candidateId_idx" ON "AutomationDecision"("candidateId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchProject" ADD CONSTRAINT "SearchProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchKeyword" ADD CONSTRAINT "SearchKeyword_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "SearchProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "SearchProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanJob" ADD CONSTRAINT "ScanJob_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendIdea" ADD CONSTRAINT "TrendIdea_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TrendResearchRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendIdea" ADD CONSTRAINT "TrendIdea_productCandidateId_fkey" FOREIGN KEY ("productCandidateId") REFERENCES "ProductCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendKeyword" ADD CONSTRAINT "TrendKeyword_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TrendKeywordSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceProduct" ADD CONSTRAINT "SourceProduct_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProductCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AliExpressProduct" ADD CONSTRAINT "AliExpressProduct_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProductCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AliExpressVariant" ADD CONSTRAINT "AliExpressVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AliExpressProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbayListing" ADD CONSTRAINT "EbayListing_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProductCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EbaySaleObservation" ADD CONSTRAINT "EbaySaleObservation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProductCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMatch" ADD CONSTRAINT "ProductMatch_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProductCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitCalculation" ADD CONSTRAINT "ProfitCalculation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProductCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejectionReason" ADD CONSTRAINT "RejectionReason_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProductCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualReview" ADD CONSTRAINT "ManualReview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProductCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProductCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStageRun" ADD CONSTRAINT "AutomationStageRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationArtifact" ADD CONSTRAINT "AutomationArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationDecision" ADD CONSTRAINT "AutomationDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Lock down Supabase Data API: enable RLS with no anon/authenticated policies.
-- Prisma connects with the database role and continues to work.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "User" FROM anon, authenticated;
GRANT ALL ON TABLE "User" TO service_role;
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Workspace" FROM anon, authenticated;
GRANT ALL ON TABLE "Workspace" TO service_role;
ALTER TABLE "WorkspaceSettings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "WorkspaceSettings" FROM anon, authenticated;
GRANT ALL ON TABLE "WorkspaceSettings" TO service_role;
ALTER TABLE "SearchProject" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SearchProject" FROM anon, authenticated;
GRANT ALL ON TABLE "SearchProject" TO service_role;
ALTER TABLE "SearchKeyword" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SearchKeyword" FROM anon, authenticated;
GRANT ALL ON TABLE "SearchKeyword" TO service_role;
ALTER TABLE "Scan" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Scan" FROM anon, authenticated;
GRANT ALL ON TABLE "Scan" TO service_role;
ALTER TABLE "ScanJob" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ScanJob" FROM anon, authenticated;
GRANT ALL ON TABLE "ScanJob" TO service_role;
ALTER TABLE "ProductCandidate" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProductCandidate" FROM anon, authenticated;
GRANT ALL ON TABLE "ProductCandidate" TO service_role;
ALTER TABLE "TrendResearchRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TrendResearchRun" FROM anon, authenticated;
GRANT ALL ON TABLE "TrendResearchRun" TO service_role;
ALTER TABLE "TrendIdea" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TrendIdea" FROM anon, authenticated;
GRANT ALL ON TABLE "TrendIdea" TO service_role;
ALTER TABLE "TrendKeywordSnapshot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TrendKeywordSnapshot" FROM anon, authenticated;
GRANT ALL ON TABLE "TrendKeywordSnapshot" TO service_role;
ALTER TABLE "TrendKeyword" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TrendKeyword" FROM anon, authenticated;
GRANT ALL ON TABLE "TrendKeyword" TO service_role;
ALTER TABLE "SourceProduct" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SourceProduct" FROM anon, authenticated;
GRANT ALL ON TABLE "SourceProduct" TO service_role;
ALTER TABLE "AliExpressProduct" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AliExpressProduct" FROM anon, authenticated;
GRANT ALL ON TABLE "AliExpressProduct" TO service_role;
ALTER TABLE "AliExpressVariant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AliExpressVariant" FROM anon, authenticated;
GRANT ALL ON TABLE "AliExpressVariant" TO service_role;
ALTER TABLE "EbayListing" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "EbayListing" FROM anon, authenticated;
GRANT ALL ON TABLE "EbayListing" TO service_role;
ALTER TABLE "EbaySaleObservation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "EbaySaleObservation" FROM anon, authenticated;
GRANT ALL ON TABLE "EbaySaleObservation" TO service_role;
ALTER TABLE "ProductMatch" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProductMatch" FROM anon, authenticated;
GRANT ALL ON TABLE "ProductMatch" TO service_role;
ALTER TABLE "ProfitCalculation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProfitCalculation" FROM anon, authenticated;
GRANT ALL ON TABLE "ProfitCalculation" TO service_role;
ALTER TABLE "RejectionReason" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RejectionReason" FROM anon, authenticated;
GRANT ALL ON TABLE "RejectionReason" TO service_role;
ALTER TABLE "ManualReview" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ManualReview" FROM anon, authenticated;
GRANT ALL ON TABLE "ManualReview" TO service_role;
ALTER TABLE "ExportRecord" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ExportRecord" FROM anon, authenticated;
GRANT ALL ON TABLE "ExportRecord" TO service_role;
ALTER TABLE "DataSourceCredential" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DataSourceCredential" FROM anon, authenticated;
GRANT ALL ON TABLE "DataSourceCredential" TO service_role;
ALTER TABLE "DataSourceHealthEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DataSourceHealthEvent" FROM anon, authenticated;
GRANT ALL ON TABLE "DataSourceHealthEvent" TO service_role;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AuditLog" FROM anon, authenticated;
GRANT ALL ON TABLE "AuditLog" TO service_role;
ALTER TABLE "ScheduleConfig" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ScheduleConfig" FROM anon, authenticated;
GRANT ALL ON TABLE "ScheduleConfig" TO service_role;
ALTER TABLE "AutomationRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AutomationRun" FROM anon, authenticated;
GRANT ALL ON TABLE "AutomationRun" TO service_role;
ALTER TABLE "AutomationStageRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AutomationStageRun" FROM anon, authenticated;
GRANT ALL ON TABLE "AutomationStageRun" TO service_role;
ALTER TABLE "AutomationArtifact" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AutomationArtifact" FROM anon, authenticated;
GRANT ALL ON TABLE "AutomationArtifact" TO service_role;
ALTER TABLE "AutomationDecision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AutomationDecision" FROM anon, authenticated;
GRANT ALL ON TABLE "AutomationDecision" TO service_role;
