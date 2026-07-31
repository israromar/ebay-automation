import { NextResponse, type NextRequest } from "next/server";

/**
 * Single catch-all so Vercel Hobby stays under the 12 serverless-function limit.
 * Handlers are loaded dynamically so light routes (auth/me, overview) do not pull
 * DINOv2 / ORT / scan stack into every cold start.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

function idCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function resolveHandler(path: string[], method: Method): Promise<Handler | null> {
  const p = path.join("/");

  if (p === "overview" && method === "GET") {
    const m = await import("@/lib/api-handlers/overview");
    return m.GET as Handler;
  }
  if (p === "settings" && method === "GET") {
    const m = await import("@/lib/api-handlers/settings");
    return m.GET as Handler;
  }
  if (p === "settings" && method === "PUT") {
    const m = await import("@/lib/api-handlers/settings");
    return m.PUT as Handler;
  }
  if (p === "scans" && method === "GET") {
    const m = await import("@/lib/api-handlers/scans");
    return m.GET as Handler;
  }
  if (p === "scans" && method === "POST") {
    const m = await import("@/lib/api-handlers/scans");
    return m.POST as Handler;
  }
  if (p === "batch" && method === "POST") {
    const m = await import("@/lib/api-handlers/batch");
    return m.POST as Handler;
  }
  if (p === "export" && method === "GET") {
    const m = await import("@/lib/api-handlers/export");
    return m.GET as Handler;
  }
  if (p === "export" && method === "POST") {
    const m = await import("@/lib/api-handlers/export");
    return m.POST as Handler;
  }
  if (p === "schedules" && method === "GET") {
    const m = await import("@/lib/api-handlers/schedules");
    return m.GET as Handler;
  }
  if (p === "schedules" && method === "POST") {
    const m = await import("@/lib/api-handlers/schedules");
    return m.POST as Handler;
  }
  if (p === "schedules" && method === "PUT") {
    const m = await import("@/lib/api-handlers/schedules");
    return m.PUT as Handler;
  }
  if (p === "auth/logout" && method === "POST") {
    const m = await import("@/lib/api-handlers/auth-logout");
    return m.POST as Handler;
  }
  if (p === "auth/me" && method === "GET") {
    const m = await import("@/lib/api-handlers/auth-me");
    return m.GET as Handler;
  }
  if (p === "candidates" && method === "GET") {
    const m = await import("@/lib/api-handlers/candidates-list");
    return m.GET as Handler;
  }
  if (p === "research" && method === "GET") {
    const m = await import("@/lib/api-handlers/research");
    return m.GET as Handler;
  }
  if (p === "research" && method === "POST") {
    const m = await import("@/lib/api-handlers/research");
    return m.POST as Handler;
  }
  if (p === "research/ideas" && method === "GET") {
    const m = await import("@/lib/api-handlers/research-ideas");
    return m.GET as Handler;
  }
  if (p === "research/ideas/match" && method === "POST") {
    const m = await import("@/lib/api-handlers/research-ideas-match");
    return m.POST as Handler;
  }
  if (p === "research/ideas/enrich-sold" && method === "POST") {
    const m = await import("@/lib/api-handlers/research-ideas-enrich-sold");
    return m.POST as Handler;
  }
  if (p === "research/trends" && method === "GET") {
    const m = await import("@/lib/api-handlers/research-trends");
    return m.GET as Handler;
  }
  if (p === "research/trends/refresh" && method === "POST") {
    const m = await import("@/lib/api-handlers/research-trends-refresh");
    return m.POST as Handler;
  }
  if (p === "analyzer/inspect" && method === "POST") {
    const m = await import("@/lib/api-handlers/analyzer-inspect");
    return m.POST as Handler;
  }
  if (p === "analyzer/market" && method === "GET") {
    const m = await import("@/lib/api-handlers/analyzer-market");
    return m.GET as Handler;
  }
  if (p === "analyzer/match" && method === "POST") {
    const m = await import("@/lib/api-handlers/analyzer-match");
    return m.POST as Handler;
  }
  if (p === "automation/runs" && method === "GET") {
    const m = await import("@/lib/api-handlers/automation-runs");
    return m.GET as Handler;
  }
  if (p === "automation/runs" && method === "POST") {
    const m = await import("@/lib/api-handlers/automation-runs");
    return m.POST as Handler;
  }

  if (path[0] === "candidates" && path.length === 2) {
    const id = path[1]!;
    const m = await import("@/lib/api-handlers/candidates-by-id");
    if (method === "GET") return (req) => m.GET(req, idCtx(id));
    if (method === "POST") return (req) => m.POST(req, idCtx(id));
  }
  if (path[0] === "candidates" && path[2] === "sold-history" && path[3] === "fetch" && path.length === 4) {
    const id = path[1]!;
    const m = await import("@/lib/api-handlers/candidates-sold-history-fetch");
    if (method === "POST") return (req) => m.POST(req, idCtx(id));
  }
  if (path[0] === "research" && path[1] === "ideas" && path.length === 3 && path[2] !== "match" && path[2] !== "enrich-sold") {
    const id = path[2]!;
    const m = await import("@/lib/api-handlers/research-ideas-by-id");
    if (method === "PATCH") return (req) => m.PATCH(req, idCtx(id));
  }
  if (path[0] === "automation" && path[1] === "runs" && path.length === 3) {
    const id = path[2]!;
    const m = await import("@/lib/api-handlers/automation-runs-by-id");
    if (method === "GET") return (req) => m.GET(req, idCtx(id));
  }
  if (path[0] === "automation" && path[1] === "runs" && path.length === 4) {
    const id = path[2]!;
    const action = path[3];
    if (action === "approve" && method === "POST") {
      const m = await import("@/lib/api-handlers/automation-runs-approve");
      return (req) => m.POST(req, idCtx(id));
    }
    if (action === "cancel" && method === "POST") {
      const m = await import("@/lib/api-handlers/automation-runs-cancel");
      return (req) => m.POST(req, idCtx(id));
    }
    if (action === "resume" && method === "POST") {
      const m = await import("@/lib/api-handlers/automation-runs-resume");
      return (req) => m.POST(req, idCtx(id));
    }
    if (action === "export" && method === "POST") {
      const m = await import("@/lib/api-handlers/automation-runs-export");
      return (req) => m.POST(req, idCtx(id));
    }
  }

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
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api]", message);
    return NextResponse.json({ error: message }, { status: 500 });
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
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return handle(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return handle(req, ctx);
}
