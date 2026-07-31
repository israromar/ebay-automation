import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit") ?? 50);
  const candidates = await prisma.productCandidate.findMany({
    where: {
      scan: { project: { workspaceId: session.workspace.id } },
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(limit, 200),
  });
  return NextResponse.json({ candidates });
}
