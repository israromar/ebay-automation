import { NextResponse } from "next/server";
import { z } from "zod";
import { requireExtensionWorkspace } from "@/lib/auth/extension-token";
import { prisma } from "@/lib/db";
import { applyPurchaseHistory, extensionStats, leaseQueue, listingForPanel, trackFromUrl } from "@/lib/services/extension";

/** Endpoints called by the Hunter Companion Chrome extension (Bearer token auth, no session cookie). */

const MAX_HTML_CHARS = 1_500_000;

function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export async function STATUS(req: Request) {
  const auth = await requireExtensionWorkspace(req);
  if (isResponse(auth)) return auth;
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: auth.workspaceId }, select: { name: true } });
  const stats = await extensionStats(auth.workspaceId);
  return NextResponse.json({ workspace: workspace.name, ...stats, tokens: undefined });
}

export async function QUEUE(req: Request) {
  const auth = await requireExtensionWorkspace(req);
  if (isResponse(auth)) return auth;
  const limit = Math.min(25, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 10) || 10));
  const result = await leaseQueue(auth.workspaceId, limit);
  return NextResponse.json({ ...result, tokens: undefined });
}

const historySchema = z.object({
  itemId: z.string().min(5).max(40),
  html: z.string().max(MAX_HTML_CHARS),
  finalUrl: z.string().max(2000).nullish(),
});

export async function PURCHASE_HISTORY(req: Request) {
  const auth = await requireExtensionWorkspace(req);
  if (isResponse(auth)) return auth;
  const parsed = historySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const outcome = await applyPurchaseHistory(auth.workspaceId, parsed.data);
  return NextResponse.json(outcome, { status: outcome.status === "not_tracked" ? 404 : 200 });
}

export async function TRACK(req: Request) {
  const auth = await requireExtensionWorkspace(req);
  if (isResponse(auth)) return auth;
  const parsed = z.object({ url: z.string().min(5).max(2000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { url }" }, { status: 400 });
  try {
    const { listing, created } = await trackFromUrl(auth.workspaceId, parsed.data.url);
    return NextResponse.json({ id: listing.id, created, sold30d: listing.sold30d, demandTier: listing.demandTier });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }
}

export async function LISTING(req: Request) {
  const auth = await requireExtensionWorkspace(req);
  if (isResponse(auth)) return auth;
  const item = new URL(req.url).searchParams.get("item") ?? "";
  return NextResponse.json({ listing: await listingForPanel(auth.workspaceId, item) });
}
