import { NextResponse } from "next/server";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import { createAliExpressProvider, createEbayProvider, createVisualMatchProvider, loadWorkspaceRules } from "@/lib/services/providers";
import { z } from "zod";

const schema = z.object({
  ideaIds: z.array(z.string().min(1)).min(1).max(20),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rules = await loadWorkspaceRules();
  const orchestrator = new ScanOrchestrator({
    aliexpress: createAliExpressProvider(),
    ebay: createEbayProvider(),
    visualMatch: createVisualMatchProvider(),
    rules,
  });
  const result = await orchestrator.matchTrendIdeas(parsed.data.ideaIds);
  return NextResponse.json(result);
}
