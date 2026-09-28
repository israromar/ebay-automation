-- Source finder: saved eBay-link → AliExpress lookups.

-- CreateTable
CREATE TABLE "SourceLookup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ebayUrl" TEXT NOT NULL,
    "ebayItemId" TEXT,
    "marketplaceId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "title" TEXT,
    "imageUrl" TEXT,
    "priceMinor" INTEGER,
    "status" TEXT NOT NULL,
    "bestConfidence" INTEGER,
    "bestTier" TEXT,
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceLookup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceLookup_workspaceId_createdAt_idx" ON "SourceLookup"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "SourceLookup" ADD CONSTRAINT "SourceLookup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lock down Supabase Data API for the new table (Prisma connects as owner).
ALTER TABLE "SourceLookup" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "SourceLookup" FROM anon, authenticated;
  END IF;
END $$;
