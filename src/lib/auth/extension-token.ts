import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const PREFIX = "hx_";
const LAST_SEEN_WRITE_MS = 60_000;

export function hashExtensionToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/** Creates a token for the companion extension. The plain value is returned once and never stored. */
export async function createExtensionToken(workspaceId: string, label = "Chrome extension") {
  const token = `${PREFIX}${randomBytes(24).toString("base64url")}`;
  const record = await prisma.extensionToken.create({
    data: { workspaceId, label: label.slice(0, 80), tokenHash: hashExtensionToken(token) },
  });
  return { token, record };
}

export async function revokeExtensionTokens(workspaceId: string, id?: string) {
  const { count } = await prisma.extensionToken.updateMany({
    where: { workspaceId, revokedAt: null, ...(id ? { id } : {}) },
    data: { revokedAt: new Date() },
  });
  return count;
}

export type ExtensionSession = { workspaceId: string; tokenId: string };

/** Authenticates `Authorization: Bearer hx_…` from the companion extension. */
export async function requireExtensionWorkspace(req: Request): Promise<ExtensionSession | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith(PREFIX)) {
    return NextResponse.json({ error: "Missing extension token" }, { status: 401 });
  }
  const record = await prisma.extensionToken.findUnique({ where: { tokenHash: hashExtensionToken(token) } });
  if (!record || record.revokedAt) {
    return NextResponse.json({ error: "Invalid or revoked extension token" }, { status: 401 });
  }
  if (!record.lastSeenAt || Date.now() - record.lastSeenAt.getTime() > LAST_SEEN_WRITE_MS) {
    await prisma.extensionToken.update({ where: { id: record.id }, data: { lastSeenAt: new Date() } });
  }
  return { workspaceId: record.workspaceId, tokenId: record.id };
}
