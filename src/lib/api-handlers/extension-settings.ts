import { execFile } from "child_process";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";
import { promisify } from "util";
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

const ZIP_PATH = path.join(process.cwd(), "public", "hunter-companion.zip");

/** Dev only: run the same build script `npm run ext:build` uses, baked with this app's origin. */
async function buildZipForDev(appUrl: string) {
  const tsx = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  await promisify(execFile)(tsx, [path.join(process.cwd(), "scripts", "build-extension.ts")], {
    env: { ...process.env, HUNTER_APP_URL: appUrl },
    timeout: 60_000,
  });
}

/** Download the Hunter Companion zip. Builds it on demand in dev; never a silent 404. */
export async function DOWNLOAD(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  if (!existsSync(ZIP_PATH)) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Extension package missing: the deploy must run `npm run build` (its prebuild step runs `npm run ext:build`)." },
        { status: 503 },
      );
    }
    try {
      await buildZipForDev(new URL(req.url).origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: `Could not build the extension (run \`npm run ext:build\`): ${message.split("\n")[0]}` },
        { status: 500 },
      );
    }
  }

  const bytes = await readFile(ZIP_PATH);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="hunter-companion.zip"',
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
