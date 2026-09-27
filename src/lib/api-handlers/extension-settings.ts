import { NextResponse } from "next/server";
import { z } from "zod";
import { createExtensionToken, revokeExtensionTokens } from "@/lib/auth/extension-token";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { extensionStats } from "@/lib/services/extension";

/** Session-authenticated: manage companion-extension tokens and show its activity in the app. */

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  return NextResponse.json(await extensionStats(session.workspace.id));
}

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const body = z
    .object({ action: z.enum(["create", "revoke"]), label: z.string().max(80).optional(), id: z.string().optional() })
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (body.data.action === "revoke") {
    const revoked = await revokeExtensionTokens(session.workspace.id, body.data.id);
    return NextResponse.json({ revoked });
  }
  const { token, record } = await createExtensionToken(session.workspace.id, body.data.label);
  return NextResponse.json({ token, id: record.id, label: record.label }, { status: 201 });
}
