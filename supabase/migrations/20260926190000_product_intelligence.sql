-- Product intelligence thresholds and research snapshots.
-- Constant defaults avoid a table rewrite on Postgres 11+.

ALTER TABLE "WorkspaceSettings" ALTER COLUMN "minimumRecentSales" SET DEFAULT 30;
UPDATE "WorkspaceSettings" SET "minimumRecentSales" = 30 WHERE "minimumRecentSales" = 5;
ALTER TABLE "WorkspaceSettings" ADD COLUMN IF NOT EXISTS "minSellThroughRate" DOUBLE PRECISION NOT NULL DEFAULT 0.2;
ALTER TABLE "WorkspaceSettings" ADD COLUMN IF NOT EXISTS "minimumProfitMinor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ProductCandidate" ADD COLUMN IF NOT EXISTS "opportunityScore" INTEGER;
ALTER TABLE "ProductCandidate" ADD COLUMN IF NOT EXISTS "classification" TEXT;
ALTER TABLE "ProductCandidate" ADD COLUMN IF NOT EXISTS "researchSnapshotJson" TEXT;

ALTER TABLE "TrendIdea" ADD COLUMN IF NOT EXISTS "sellerCount" INTEGER;
ALTER TABLE "TrendIdea" ADD COLUMN IF NOT EXISTS "topSellerListingShare" DOUBLE PRECISION;
ALTER TABLE "TrendIdea" ADD COLUMN IF NOT EXISTS "opportunityScore" INTEGER;
ALTER TABLE "TrendIdea" ADD COLUMN IF NOT EXISTS "classification" TEXT;
ALTER TABLE "TrendIdea" ADD COLUMN IF NOT EXISTS "researchSnapshotJson" TEXT;
