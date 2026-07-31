import { NextResponse } from "next/server";
import { z } from "zod";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { assertResearchRunAllowed } from "@/lib/auth/usage-caps";
import { detectAutomationCapabilities } from "@/lib/domain/automation";
import { AutonomousResearchOrchestrator } from "@/lib/services/autonomous-research";

const startSchema = z.object({
  topKeywords: z.number().int().min(1).max(20).optional(),
  productsPerKeyword: z.number().int().min(1).max(20).optional(),
  topIdeas: z.number().int().min(1).max(40).optional(),
  searchLimit: z.number().int().min(5).max(50).optional(),
  maxRuntimeMs: z
    .number()
    .int()
    .min(60_000)
    .max(60 * 60_000)
    .optional(),
  destination: z.enum(["csv", "google_sheets"]).optional(),
  market: z.string().min(2).max(8).optional(),
  keywords: z.array(z.string().min(1)).max(20).optional(),
  highQualityFilter: z.boolean().optional(),
  highQualityMinEbayPriceMinor: z.number().int().min(500).max(100_000).optional(),
  highQualityMaxAeLandedCostRatio: z.number().min(0.05).max(0.95).optional(),
  highQualityMinNetMarginPercent: z.number().min(5).max(80).optional(),
  highQualityMinOrderCount: z.number().int().min(10).max(100_000).optional(),
});

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  try {
    const orchestrator = new AutonomousResearchOrchestrator();
    const runs = await orchestrator.listRuns(30, session.workspace.id);
    return NextResponse.json({
      runs,
      capabilities: detectAutomationCapabilities(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load automation runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const cap = await assertResearchRunAllowed(session.workspace.id);
  if (!cap.ok) {
    return NextResponse.json({ error: cap.message }, { status: 429 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = startSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const orchestrator = new AutonomousResearchOrchestrator();
    const run = await orchestrator.start({ ...parsed.data, workspaceId: session.workspace.id });
    // Kick the first stage immediately so the UI shows progress without a worker.
    const advanced = await orchestrator.advance(run.id);
    return NextResponse.json({ run: advanced });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start automation run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
