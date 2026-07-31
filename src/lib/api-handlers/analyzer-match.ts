import { NextResponse } from "next/server";
import { z } from "zod";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import {
  createAliExpressProvider,
  createEbayProvider,
  createVisualMatchProvider,
  loadWorkspaceRules,
} from "@/lib/services/providers";
import { inspectMarketItem } from "@/lib/services/analyzer";
import { extractEbayItemId } from "@/lib/domain/ebay-sold-history";

const bodySchema = z.object({
  query: z.string().min(1),
  ideaId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.ideaId) {
      const orchestrator = new ScanOrchestrator({
        aliexpress: createAliExpressProvider(),
        ebay: createEbayProvider(),
        visualMatch: createVisualMatchProvider(),
        rules: await loadWorkspaceRules(session.workspace.id),
        workspaceId: session.workspace.id,
      });
      await orchestrator.matchTrendIdeas([parsed.data.ideaId]);
      const analysis = await inspectMarketItem({
        workspaceId: session.workspace.id,
        query: parsed.data.query,
        ideaId: parsed.data.ideaId,
      });
      return NextResponse.json({ analysis });
    }

    const itemId = extractEbayItemId(parsed.data.query);
    const ebayUrl = parsed.data.query.startsWith("http")
      ? parsed.data.query
      : itemId
        ? `https://www.ebay.com/itm/${itemId.replace(/^v1\|/, "").split("|")[0]}`
        : null;
    if (!itemId && !ebayUrl) {
      return NextResponse.json({ error: "Provide an eBay item URL/id or ideaId to match." }, { status: 400 });
    }

    const orchestrator = new ScanOrchestrator({
      aliexpress: createAliExpressProvider(),
      ebay: createEbayProvider(),
      visualMatch: createVisualMatchProvider(),
      rules: await loadWorkspaceRules(session.workspace.id),
      workspaceId: session.workspace.id,
    });
    const result = await orchestrator.run({
      keyword: "analyzer",
      mode: "ebay_url",
      ebayItemId: itemId ?? undefined,
      ebayUrl: ebayUrl ?? undefined,
      limit: 1,
    });
    const first = result.candidates?.[0] as { id?: string } | undefined;
    const candidateId = typeof first?.id === "string" ? first.id : undefined;
    const analysis = await inspectMarketItem({
      workspaceId: session.workspace.id,
      query: parsed.data.query,
      candidateId,
    });
    return NextResponse.json({ analysis, scanId: result.scanId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
