import { NextResponse, type NextRequest } from "next/server";

import * as authLogout from "@/lib/api-handlers/auth-logout";
import * as authMe from "@/lib/api-handlers/auth-me";
import * as automationRuns from "@/lib/api-handlers/automation-runs";
import * as automationRunsApprove from "@/lib/api-handlers/automation-runs-approve";
import * as automationRunsById from "@/lib/api-handlers/automation-runs-by-id";
import * as automationRunsCancel from "@/lib/api-handlers/automation-runs-cancel";
import * as automationRunsExport from "@/lib/api-handlers/automation-runs-export";
import * as automationRunsResume from "@/lib/api-handlers/automation-runs-resume";
import * as batch from "@/lib/api-handlers/batch";
import * as candidatesById from "@/lib/api-handlers/candidates-by-id";
import * as candidatesList from "@/lib/api-handlers/candidates-list";
import * as candidatesSoldHistoryFetch from "@/lib/api-handlers/candidates-sold-history-fetch";
import * as exportHandlers from "@/lib/api-handlers/export";
import * as overview from "@/lib/api-handlers/overview";
import * as research from "@/lib/api-handlers/research";
import * as researchIdeas from "@/lib/api-handlers/research-ideas";
import * as researchIdeasById from "@/lib/api-handlers/research-ideas-by-id";
import * as researchIdeasEnrichSold from "@/lib/api-handlers/research-ideas-enrich-sold";
import * as researchIdeasMatch from "@/lib/api-handlers/research-ideas-match";
import * as researchTrends from "@/lib/api-handlers/research-trends";
import * as researchTrendsRefresh from "@/lib/api-handlers/research-trends-refresh";
import * as scans from "@/lib/api-handlers/scans";
import * as schedules from "@/lib/api-handlers/schedules";
import * as settings from "@/lib/api-handlers/settings";

/**
 * Single catch-all so Vercel Hobby stays under the 12 serverless-function limit.
 * URLs are unchanged (/api/research, /api/candidates/:id, …).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

function idCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function match(path: string[], method: Method): Handler | null {
  const p = path.join("/");

  if (p === "overview" && method === "GET") return overview.GET as Handler;
  if (p === "settings" && method === "GET") return settings.GET as Handler;
  if (p === "settings" && method === "PUT") return settings.PUT as Handler;
  if (p === "scans" && method === "GET") return scans.GET as Handler;
  if (p === "scans" && method === "POST") return scans.POST as Handler;
  if (p === "batch" && method === "POST") return batch.POST as Handler;
  if (p === "export" && method === "GET") return exportHandlers.GET as Handler;
  if (p === "export" && method === "POST") return exportHandlers.POST as Handler;
  if (p === "schedules" && method === "GET") return schedules.GET as Handler;
  if (p === "schedules" && method === "POST") return schedules.POST as Handler;
  if (p === "schedules" && method === "PUT") return schedules.PUT as Handler;
  if (p === "auth/logout" && method === "POST") return authLogout.POST as Handler;
  if (p === "auth/me" && method === "GET") return authMe.GET as Handler;
  if (p === "candidates" && method === "GET") return candidatesList.GET as Handler;
  if (p === "research" && method === "GET") return research.GET as Handler;
  if (p === "research" && method === "POST") return research.POST as Handler;
  if (p === "research/ideas" && method === "GET") return researchIdeas.GET as Handler;
  if (p === "research/ideas/match" && method === "POST") return researchIdeasMatch.POST as Handler;
  if (p === "research/ideas/enrich-sold" && method === "POST") return researchIdeasEnrichSold.POST as Handler;
  if (p === "research/trends" && method === "GET") return researchTrends.GET as Handler;
  if (p === "research/trends/refresh" && method === "POST") return researchTrendsRefresh.POST as Handler;
  if (p === "automation/runs" && method === "GET") return automationRuns.GET as Handler;
  if (p === "automation/runs" && method === "POST") return automationRuns.POST as Handler;

  if (path[0] === "candidates" && path.length === 2) {
    const id = path[1]!;
    if (method === "GET") return (req) => candidatesById.GET(req, idCtx(id));
    if (method === "POST") return (req) => candidatesById.POST(req, idCtx(id));
  }
  if (path[0] === "candidates" && path[2] === "sold-history" && path[3] === "fetch" && path.length === 4) {
    const id = path[1]!;
    if (method === "POST") return (req) => candidatesSoldHistoryFetch.POST(req, idCtx(id));
  }
  if (path[0] === "research" && path[1] === "ideas" && path.length === 3 && path[2] !== "match" && path[2] !== "enrich-sold") {
    const id = path[2]!;
    if (method === "PATCH") return (req) => researchIdeasById.PATCH(req, idCtx(id));
  }
  if (path[0] === "automation" && path[1] === "runs" && path.length === 3) {
    const id = path[2]!;
    if (method === "GET") return (req) => automationRunsById.GET(req, idCtx(id));
  }
  if (path[0] === "automation" && path[1] === "runs" && path.length === 4) {
    const id = path[2]!;
    const action = path[3];
    if (action === "approve" && method === "POST") return (req) => automationRunsApprove.POST(req, idCtx(id));
    if (action === "cancel" && method === "POST") return (req) => automationRunsCancel.POST(req, idCtx(id));
    if (action === "resume" && method === "POST") return (req) => automationRunsResume.POST(req, idCtx(id));
    if (action === "export" && method === "POST") return (req) => automationRunsExport.POST(req, idCtx(id));
  }

  return null;
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const method = req.method.toUpperCase() as Method;
  const handler = match(path, method);
  if (!handler) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return handler(req);
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
