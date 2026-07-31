import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { trendIdeaInWorkspace } from "@/lib/auth/workspace-access";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["DISMISSED", "DISCOVERED"]).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const { id } = await ctx.params;
  if (!(await trendIdeaInWorkspace(id, session.workspace.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.trendIdea.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const idea = await prisma.trendIdea.update({
    where: { id },
    data: { status: parsed.data.status ?? "DISMISSED" },
  });
  return NextResponse.json({ idea });
}
