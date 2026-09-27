import { NextResponse } from "next/server";
import { z } from "zod";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { US_TRENDING_KEYWORD_CATALOG } from "@/lib/research/us-trending-keywords";
import { createHunt } from "@/lib/services/hunt";
import { serializeHunt } from "./hunt-serialize";

const DEFAULT_MAX_HUNTS_PER_DAY = 30;

const schema = z.object({
  keywords: z.array(z.string()).max(50).default([]),
  /** Used when keywords is empty: take the top N trending keywords, optionally from one niche. */
  niche: z.string().optional(),
  trendingCount: z.number().int().min(1).max(50).default(10),
});

export function trendingKeywords(niche: string | undefined, count: number): string[] {
  return US_TRENDING_KEYWORD_CATALOG.keywords
    .filter((k) => !niche || k.niche === niche)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map((k) => k.keyword);
}

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const hunts = await prisma.hunt.findMany({
    where: { workspaceId: session.workspace.id },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ hunts: hunts.map(serializeHunt) });
}

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const max = Number(process.env.MAX_HUNTS_PER_DAY ?? DEFAULT_MAX_HUNTS_PER_DAY) || DEFAULT_MAX_HUNTS_PER_DAY;
  const recent = await prisma.hunt.count({
    where: { workspaceId: session.workspace.id, startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (recent >= max) {
    return NextResponse.json(
      { error: `Daily limit reached (${max} hunts / 24h). Raise MAX_HUNTS_PER_DAY to allow more.` },
      { status: 429 },
    );
  }

  const typed = [...new Set(parsed.data.keywords.map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2))];
  const keywords = typed.length ? typed : trendingKeywords(parsed.data.niche, parsed.data.trendingCount);
  if (keywords.length === 0) return NextResponse.json({ error: "No keywords to hunt" }, { status: 400 });

  const hunt = await createHunt(session.workspace.id, { kind: "KEYWORDS", keywords });
  return NextResponse.json({ hunt: serializeHunt(hunt) }, { status: 201 });
}
