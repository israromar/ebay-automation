import { NextResponse } from "next/server";
import { z } from "zod";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/export/csv";
import { runSourceLookup, type SourceLookupResult } from "@/lib/services/source-finder";

type Ctx = { params: Promise<Record<string, string>> };

const DEFAULT_MAX_PER_DAY = 60;

function serialize(row: NonNullable<Awaited<ReturnType<typeof prisma.sourceLookup.findFirst>>>) {
  const { resultJson, ...rest } = row;
  const result = JSON.parse(resultJson || "{}") as Partial<SourceLookupResult>;
  return { ...rest, result: result.ebay ? result : null };
}

async function owned(id: string | undefined, workspaceId: string) {
  return id ? prisma.sourceLookup.findFirst({ where: { id, workspaceId } }) : null;
}

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const rows = await prisma.sourceLookup.findMany({
    where: { workspaceId: session.workspace.id },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      ebayUrl: true,
      title: true,
      imageUrl: true,
      priceMinor: true,
      currency: true,
      status: true,
      bestConfidence: true,
      bestTier: true,
      error: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ lookups: rows });
}

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const body = z.object({ url: z.string().trim().min(10).max(2000) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Paste an eBay listing link" }, { status: 400 });

  const max = Number(process.env.MAX_SOURCE_LOOKUPS_PER_DAY ?? DEFAULT_MAX_PER_DAY) || DEFAULT_MAX_PER_DAY;
  const recent = await prisma.sourceLookup.count({
    where: { workspaceId: session.workspace.id, updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (recent >= max) {
    return NextResponse.json(
      { error: `Daily limit reached (${max} lookups / 24h). Raise MAX_SOURCE_LOOKUPS_PER_DAY to allow more.` },
      { status: 429 },
    );
  }

  const row = await runSourceLookup(session.workspace.id, body.data.url);
  return NextResponse.json({ lookup: serialize(row) }, { status: row.status === "failed" ? 422 : 201 });
}

export async function GET_ONE(_req: Request, ctx?: Ctx) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const row = await owned((await ctx?.params)?.id, session.workspace.id);
  if (!row) return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
  return NextResponse.json({ lookup: serialize(row) });
}

export async function RERUN(_req: Request, ctx?: Ctx) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const row = await owned((await ctx?.params)?.id, session.workspace.id);
  if (!row) return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
  const updated = await runSourceLookup(session.workspace.id, row.ebayUrl, row.id);
  return NextResponse.json({ lookup: serialize(updated) }, { status: updated.status === "failed" ? 422 : 200 });
}

export async function EXPORT(_req: Request, ctx?: Ctx) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const row = await owned((await ctx?.params)?.id, session.workspace.id);
  if (!row) return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
  const result = JSON.parse(row.resultJson || "{}") as Partial<SourceLookupResult>;
  const money = (m: number | null | undefined) => (m == null ? "" : (m / 100).toFixed(2));
  const csv = toCsv(
    (result.candidates ?? []).map((c, i) => ({
      rank: i + 1,
      confidence: c.confidence,
      tier: c.tier,
      text_score: c.textScore,
      image_score: c.visual?.score ?? "",
      ae_title: c.title,
      ae_url: c.url,
      ae_price: money(c.priceMinor),
      currency: c.currency,
      rating: c.rating?.toFixed(2) ?? "",
      orders: c.orderCount ?? "",
      est_profit: money(c.estimatedProfitMinor),
      margin_pct: c.marginPct,
      meets_min_profit: c.meetsProfit === false ? "no" : "yes",
      reasons: c.reasons.join(" "),
      ebay_title: result.ebay?.title ?? "",
      ebay_url: result.ebay?.url ?? row.ebayUrl,
    })),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aliexpress-sources-${row.ebayItemId ?? row.id}.csv"`,
    },
  });
}
