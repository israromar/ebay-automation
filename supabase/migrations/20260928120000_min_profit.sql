-- Minimum profit per sale (USD cents), default $2.

-- AlterTable
ALTER TABLE "HuntSettings" ADD COLUMN     "minProfitMinor" INTEGER NOT NULL DEFAULT 200;

