-- Single-feature rebuild: winning-product hunter. Drops legacy research/automation tables.

-- DropForeignKey
ALTER TABLE "WorkspaceSettings" DROP CONSTRAINT "WorkspaceSettings_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "SearchProject" DROP CONSTRAINT "SearchProject_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "SearchKeyword" DROP CONSTRAINT "SearchKeyword_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Scan" DROP CONSTRAINT "Scan_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ScanJob" DROP CONSTRAINT "ScanJob_scanId_fkey";

-- DropForeignKey
ALTER TABLE "ProductCandidate" DROP CONSTRAINT "ProductCandidate_scanId_fkey";

-- DropForeignKey
ALTER TABLE "TrendIdea" DROP CONSTRAINT "TrendIdea_runId_fkey";

-- DropForeignKey
ALTER TABLE "TrendIdea" DROP CONSTRAINT "TrendIdea_productCandidateId_fkey";

-- DropForeignKey
ALTER TABLE "TrendKeyword" DROP CONSTRAINT "TrendKeyword_snapshotId_fkey";

-- DropForeignKey
ALTER TABLE "SourceProduct" DROP CONSTRAINT "SourceProduct_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "AliExpressProduct" DROP CONSTRAINT "AliExpressProduct_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "AliExpressVariant" DROP CONSTRAINT "AliExpressVariant_productId_fkey";

-- DropForeignKey
ALTER TABLE "EbayListing" DROP CONSTRAINT "EbayListing_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "EbaySaleObservation" DROP CONSTRAINT "EbaySaleObservation_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "ProductMatch" DROP CONSTRAINT "ProductMatch_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "ProfitCalculation" DROP CONSTRAINT "ProfitCalculation_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "RejectionReason" DROP CONSTRAINT "RejectionReason_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "ManualReview" DROP CONSTRAINT "ManualReview_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "ExportRecord" DROP CONSTRAINT "ExportRecord_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_scanId_fkey";

-- DropForeignKey
ALTER TABLE "AutomationStageRun" DROP CONSTRAINT "AutomationStageRun_runId_fkey";

-- DropForeignKey
ALTER TABLE "AutomationArtifact" DROP CONSTRAINT "AutomationArtifact_runId_fkey";

-- DropForeignKey
ALTER TABLE "AutomationDecision" DROP CONSTRAINT "AutomationDecision_runId_fkey";

-- DropTable
DROP TABLE "WorkspaceSettings";

-- DropTable
DROP TABLE "SearchProject";

-- DropTable
DROP TABLE "SearchKeyword";

-- DropTable
DROP TABLE "Scan";

-- DropTable
DROP TABLE "ScanJob";

-- DropTable
DROP TABLE "ProductCandidate";

-- DropTable
DROP TABLE "TrendResearchRun";

-- DropTable
DROP TABLE "TrendIdea";

-- DropTable
DROP TABLE "TrendKeywordSnapshot";

-- DropTable
DROP TABLE "TrendKeyword";

-- DropTable
DROP TABLE "SourceProduct";

-- DropTable
DROP TABLE "AliExpressProduct";

-- DropTable
DROP TABLE "AliExpressVariant";

-- DropTable
DROP TABLE "EbayListing";

-- DropTable
DROP TABLE "EbaySaleObservation";

-- DropTable
DROP TABLE "ProductMatch";

-- DropTable
DROP TABLE "ProfitCalculation";

-- DropTable
DROP TABLE "RejectionReason";

-- DropTable
DROP TABLE "ManualReview";

-- DropTable
DROP TABLE "ExportRecord";

-- DropTable
DROP TABLE "DataSourceCredential";

-- DropTable
DROP TABLE "DataSourceHealthEvent";

-- DropTable
DROP TABLE "AuditLog";

-- DropTable
DROP TABLE "ScheduleConfig";

-- DropTable
DROP TABLE "AutomationRun";

-- DropTable
DROP TABLE "AutomationStageRun";

-- DropTable
DROP TABLE "AutomationArtifact";

-- DropTable
DROP TABLE "AutomationDecision";

-- CreateTable
CREATE TABLE "HuntSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "minSold30d" INTEGER NOT NULL DEFAULT 20,
    "minAeRating" DOUBLE PRECISION NOT NULL DEFAULT 4.7,
    "minAeReviews" INTEGER NOT NULL DEFAULT 20,
    "minAeOrders" INTEGER NOT NULL DEFAULT 50,
    "minMatchConfidence" INTEGER NOT NULL DEFAULT 70,
    "minMarginPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "ebayFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.1325,
    "aeShippingEstimateMinor" INTEGER NOT NULL DEFAULT 300,
    "extraCostMinor" INTEGER NOT NULL DEFAULT 0,
    "minEbayPriceMinor" INTEGER NOT NULL DEFAULT 800,
    "maxEbayPriceMinor" INTEGER NOT NULL DEFAULT 15000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HuntSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hunt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'KEYWORDS',
    "label" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "scannedCount" INTEGER NOT NULL DEFAULT 0,
    "trackedCount" INTEGER NOT NULL DEFAULT 0,
    "sourcedCount" INTEGER NOT NULL DEFAULT 0,
    "winnerCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "logJson" TEXT NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Hunt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedListing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "huntId" TEXT,
    "ebayItemId" TEXT NOT NULL,
    "browseItemId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "shippingMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "keyword" TEXT NOT NULL,
    "itemCreationDate" TIMESTAMP(3),
    "lifetimeSold" INTEGER,
    "sold30d" INTEGER,
    "demandTier" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "demandSource" TEXT NOT NULL DEFAULT 'browse_tracker',
    "avgSoldPriceMinor" INTEGER,
    "lastSnapshotAt" TIMESTAMP(3),
    "sourcedAt" TIMESTAMP(3),
    "sourceError" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoldSnapshot" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "lifetimeSold" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoldSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceMatch" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "aeProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "shippingMinor" INTEGER NOT NULL,
    "shippingEstimated" BOOLEAN NOT NULL DEFAULT true,
    "rating" DOUBLE PRECISION NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "matchConfidence" INTEGER NOT NULL,
    "matchReasonsJson" TEXT NOT NULL DEFAULT '[]',
    "totalCostMinor" INTEGER NOT NULL,
    "feesMinor" INTEGER NOT NULL,
    "netProfitMinor" INTEGER NOT NULL,
    "marginPct" DOUBLE PRECISION NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronState" (
    "id" TEXT NOT NULL,
    "cursor" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HuntSettings_workspaceId_key" ON "HuntSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "Hunt_workspaceId_startedAt_idx" ON "Hunt"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "Hunt_status_updatedAt_idx" ON "Hunt"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TrackedListing_workspaceId_active_idx" ON "TrackedListing"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "TrackedListing_active_lastSnapshotAt_idx" ON "TrackedListing"("active", "lastSnapshotAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedListing_workspaceId_ebayItemId_key" ON "TrackedListing"("workspaceId", "ebayItemId");

-- CreateIndex
CREATE INDEX "SoldSnapshot_listingId_capturedAt_idx" ON "SoldSnapshot"("listingId", "capturedAt");

-- CreateIndex
CREATE INDEX "SourceMatch_listingId_rank_idx" ON "SourceMatch"("listingId", "rank");

-- AddForeignKey
ALTER TABLE "HuntSettings" ADD CONSTRAINT "HuntSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hunt" ADD CONSTRAINT "Hunt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedListing" ADD CONSTRAINT "TrackedListing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedListing" ADD CONSTRAINT "TrackedListing_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "Hunt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldSnapshot" ADD CONSTRAINT "SoldSnapshot_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "TrackedListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMatch" ADD CONSTRAINT "SourceMatch_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "TrackedListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

