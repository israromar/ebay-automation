-- Companion Chrome extension: exact sold counts from eBay purchase history, canonical AE links.

-- AlterTable
ALTER TABLE "SourceMatch" ADD COLUMN     "affiliateUrl" TEXT;

-- AlterTable
ALTER TABLE "TrackedListing" ADD COLUMN     "purchaseHistoryAt" TIMESTAMP(3),
ADD COLUMN     "purchaseHistoryStatus" TEXT;

-- CreateTable
CREATE TABLE "ExtensionToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ExtensionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionToken_tokenHash_key" ON "ExtensionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ExtensionToken_workspaceId_idx" ON "ExtensionToken"("workspaceId");

-- AddForeignKey
ALTER TABLE "ExtensionToken" ADD CONSTRAINT "ExtensionToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lock down Supabase Data API for the new table (Prisma connects as owner).
ALTER TABLE "ExtensionToken" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "ExtensionToken" FROM anon, authenticated;
  END IF;
END $$;
