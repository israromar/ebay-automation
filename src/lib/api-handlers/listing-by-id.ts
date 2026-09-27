import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeDemand, meetsDemand } from "@/lib/domain/demand";
import { buildEbayPurchaseHistoryUrl } from "@/lib/domain/ebay-purchase-history";
import { createAliExpressProvider, loadHuntSettings } from "@/lib/services/providers";
import { sourceListing } from "@/lib/services/sourcing";

type Ctx = { params: Promise<Record<string, string>> };

async function load(id: string, workspaceId: string) {
  return prisma.trackedListing.findFirst({
    where: { id, workspaceId },
    include: {
      snapshots: { orderBy: { capturedAt: "asc" } },
      sources: { orderBy: { rank: "asc" } },
    },
  });
}

export async function GET(_req: Request, ctx?: Ctx) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const { id } = (await ctx?.params) ?? {};
  const listing = id ? await load(id, session.workspace.id) : null;
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const settings = await loadHuntSettings(session.workspace.id);
  const demand =
    listing.demandSource === "terapeak" || listing.demandSource === "purchase_history"
      ? { sold30d: listing.sold30d, tier: listing.demandTier, basis: listing.demandSource, windowDays: 30 }
      : computeDemand({ snapshots: listing.snapshots, itemCreationDate: listing.itemCreationDate });
  const purchaseHistoryUrl = buildEbayPurchaseHistoryUrl(listing.browseItemId ? listing.ebayItemId : null);
  const winner = meetsDemand(listing, settings.minSold30d) && listing.sources.some((s) => s.rating >= settings.minAeRating);
  return NextResponse.json({ listing, demand, winner, settings, purchaseHistoryUrl });
}

/** Re-run AliExpress sourcing for one listing. */
export async function RESOURCE(_req: Request, ctx?: Ctx) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const { id } = (await ctx?.params) ?? {};
  const listing = id ? await load(id, session.workspace.id) : null;
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const settings = await loadHuntSettings(session.workspace.id);
  const outcome = await sourceListing(createAliExpressProvider(), listing, settings);
  await prisma.trackedListing.update({ where: { id: listing.id }, data: { sourceError: null } });
  return NextResponse.json({ outcome, listing: await load(listing.id, session.workspace.id) });
}
