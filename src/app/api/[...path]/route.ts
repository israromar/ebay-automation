import { NextResponse, type NextRequest } from "next/server";
import { describeDatabaseError } from "@/lib/db";

/**
 * Single catch-all so Vercel Hobby stays under the serverless-function limit.
 * Handlers are imported lazily per route.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Handler = (req: Request) => Promise<Response>;

function idCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function resolveHandler(path: string[], method: Method): Promise<Handler | null> {
  const p = path.join("/");

  if (p === "auth/me" && method === "GET") return (await import("@/lib/api-handlers/auth-me")).GET as Handler;
  if (p === "auth/logout" && method === "POST") return (await import("@/lib/api-handlers/auth-logout")).POST as Handler;

  if (p === "settings") {
    const m = await import("@/lib/api-handlers/settings");
    if (method === "GET") return m.GET as Handler;
    if (method === "PUT") return m.PUT;
  }
  if (p === "keywords" && method === "GET") return (await import("@/lib/api-handlers/keywords")).GET as Handler;

  if (p === "hunts") {
    const m = await import("@/lib/api-handlers/hunts");
    if (method === "GET") return m.GET as Handler;
    if (method === "POST") return m.POST;
  }
  if (path[0] === "hunts" && path[1]) {
    const id = path[1];
    const m = await import("@/lib/api-handlers/hunt-by-id");
    if (path.length === 2 && method === "GET") return (req) => m.GET(req, idCtx(id));
    if (path.length === 3 && path[2] === "cancel" && method === "POST") return (req) => m.CANCEL(req, idCtx(id));
  }

  if (p === "listings" && method === "GET") return (await import("@/lib/api-handlers/listings")).GET;
  if (p === "listings/export" && method === "GET") return (await import("@/lib/api-handlers/export")).GET;
  if (path[0] === "listings" && path[1] && path[1] !== "export") {
    const id = path[1];
    const m = await import("@/lib/api-handlers/listing-by-id");
    if (path.length === 2 && method === "GET") return (req) => m.GET(req, idCtx(id));
    if (path.length === 3 && path[2] === "resource" && method === "POST") return (req) => m.RESOURCE(req, idCtx(id));
  }

  if (p === "source-lookups") {
    const m = await import("@/lib/api-handlers/source-lookups");
    if (method === "GET") return m.GET as Handler;
    if (method === "POST") return m.POST;
  }
  if (path[0] === "source-lookups" && path[1]) {
    const id = path[1];
    const m = await import("@/lib/api-handlers/source-lookups");
    if (path.length === 2 && method === "GET") return (req) => m.GET_ONE(req, idCtx(id));
    if (path.length === 3 && path[2] === "rerun" && method === "POST") return (req) => m.RERUN(req, idCtx(id));
    if (path.length === 3 && path[2] === "export.csv" && method === "GET") return (req) => m.EXPORT(req, idCtx(id));
  }
  if (p === "terapeak/import" && method === "POST") return (await import("@/lib/api-handlers/terapeak-import")).POST;
  if (p === "settings/extension/download" && method === "GET") {
    return (await import("@/lib/api-handlers/extension-settings")).DOWNLOAD;
  }
  if (p === "settings/extension") {
    const m = await import("@/lib/api-handlers/extension-settings");
    if (method === "GET") return m.GET as Handler;
    if (method === "POST") return m.POST;
  }
  if (path[0] === "extension") {
    const m = await import("@/lib/api-handlers/extension");
    if (p === "extension/status" && method === "GET") return m.STATUS;
    if (p === "extension/queue" && method === "GET") return m.QUEUE;
    if (p === "extension/purchase-history" && method === "POST") return m.PURCHASE_HISTORY;
    if (p === "extension/track" && method === "POST") return m.TRACK;
    if (p === "extension/listing" && method === "GET") return m.LISTING;
  }
  if (p === "cron/snapshot" && method === "GET") return (await import("@/lib/api-handlers/cron-snapshot")).GET;

  return null;
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path = [] } = await ctx.params;
    const method = req.method.toUpperCase() as Method;
    const handler = await resolveHandler(path, method);
    if (!handler) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return await handler(req);
  } catch (error) {
    const setupMessage = describeDatabaseError(error);
    const message = setupMessage ?? (error instanceof Error ? error.message : String(error));
    console.error("[api]", error instanceof Error ? error.message : String(error));
    const status = setupMessage || (error instanceof Error && error.name === "ConfigError") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return handle(req, ctx);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return handle(req, ctx);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return handle(req, ctx);
}
