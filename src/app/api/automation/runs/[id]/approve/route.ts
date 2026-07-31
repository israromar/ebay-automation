import { NextResponse } from "next/server";
import { z } from "zod";
import { AutonomousResearchOrchestrator } from "@/lib/services/autonomous-research";

const schema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(50),
  actor: z.string().optional(),
  demandByCandidateId: z
    .record(
      z.string(),
      z.object({
        soldLast30Days: z.number().int().min(0),
        avgCompletedSaleMinor: z.number().int().optional(),
        medianCompletedSaleMinor: z.number().int().optional(),
        evidenceUrl: z.string().url().optional(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const orchestrator = new AutonomousResearchOrchestrator();
  try {
    const run = await orchestrator.approve(id, parsed.data);
    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to approve run";
    const status = message.includes("requires demand") || message.includes("cannot be approved") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
