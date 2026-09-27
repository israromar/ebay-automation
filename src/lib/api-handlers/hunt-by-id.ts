import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { stepHunt } from "@/lib/services/hunt";
import { serializeHunt } from "./hunt-serialize";

type Ctx = { params: Promise<Record<string, string>> };

async function loadOwned(id: string, workspaceId: string) {
  return prisma.hunt.findFirst({ where: { id, workspaceId } });
}

/** Polling this endpoint advances a running hunt by one bounded step. */
export async function GET(_req: Request, ctx?: Ctx) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const { id } = (await ctx?.params) ?? {};
  const hunt = id ? await loadOwned(id, session.workspace.id) : null;
  if (!hunt) return NextResponse.json({ error: "Hunt not found" }, { status: 404 });
  const next = hunt.status === "RUNNING" ? await stepHunt(hunt.id) : hunt;
  return NextResponse.json({ hunt: serializeHunt(next) });
}

export async function CANCEL(_req: Request, ctx?: Ctx) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const { id } = (await ctx?.params) ?? {};
  const hunt = id ? await loadOwned(id, session.workspace.id) : null;
  if (!hunt) return NextResponse.json({ error: "Hunt not found" }, { status: 404 });
  if (hunt.status !== "RUNNING") return NextResponse.json({ hunt: serializeHunt(hunt) });
  const updated = await prisma.hunt.update({ where: { id: hunt.id }, data: { status: "CANCELLED", finishedAt: new Date() } });
  return NextResponse.json({ hunt: serializeHunt(updated) });
}
