#!/usr/bin/env node
/**
 * Internal product-research MCP server (Phase 5).
 * Thin wrapper over HTTP APIs — no scrape/profit duplication.
 * Read-only by default; write tools require RESEARCH_MCP_ALLOW_WRITES=true.
 *
 * Run: npx tsx mcp/server.ts
 * Or: node --import tsx mcp/server.ts
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = process.env.RESEARCH_API_BASE ?? "http://127.0.0.1:3000";
const ALLOW_WRITES = process.env.RESEARCH_MCP_ALLOW_WRITES === "true";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

const readTools = [
  {
    name: "search_products",
    description: "List product candidates with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        status: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_product_candidate",
    description: "Get one candidate by id",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "list_approved_candidates",
    description: "List APPROVED candidates",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_rejected_candidates",
    description: "List rejected candidates",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "explain_candidate_score",
    description: "Return match/profit/rejection explanation for a candidate",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "get_scan_status",
    description: "List recent scans",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_data_source_failures",
    description: "List recent data-source health errors",
    inputSchema: { type: "object", properties: {} },
  },
];

const writeTools = [
  {
    name: "rerun_candidate_analysis",
    description: "Start a new scan (requires RESEARCH_MCP_ALLOW_WRITES=true)",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        limit: { type: "number" },
      },
      required: ["keyword"],
    },
  },
  {
    name: "export_candidates_to_google_sheets",
    description: "Export approved candidates (CSV or Sheets; requires writes enabled)",
    inputSchema: {
      type: "object",
      properties: {
        destination: { type: "string", enum: ["csv", "google_sheets"] },
      },
    },
  },
];

const server = new Server({ name: "product-research-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALLOW_WRITES ? [...readTools, ...writeTools] : readTools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  const denyWrite = () => ({
    content: [
      {
        type: "text" as const,
        text: "Write tools disabled. Set RESEARCH_MCP_ALLOW_WRITES=true after explicit approval.",
      },
    ],
    isError: true,
  });

  switch (name) {
    case "search_products": {
      const status = args.status ? `status=${encodeURIComponent(String(args.status))}&` : "";
      const limit = args.limit ? `limit=${Number(args.limit)}` : "limit=50";
      const result = await api(`/api/candidates?${status}${limit}`);
      let candidates = result.body.candidates ?? [];
      if (args.keyword) {
        const kw = String(args.keyword).toLowerCase();
        candidates = candidates.filter((c: { productName?: string; searchKeyword?: string }) =>
          `${c.productName ?? ""} ${c.searchKeyword ?? ""}`.toLowerCase().includes(kw),
        );
      }
      return { content: [{ type: "text", text: JSON.stringify({ candidates }, null, 2) }] };
    }
    case "get_product_candidate":
    case "explain_candidate_score": {
      const result = await api(`/api/candidates/${args.id}`);
      return { content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }] };
    }
    case "list_approved_candidates": {
      const result = await api("/api/candidates?status=APPROVED");
      return { content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }] };
    }
    case "list_rejected_candidates": {
      const [a, b, c] = await Promise.all([
        api("/api/candidates?status=ALIEXPRESS_REJECTED"),
        api("/api/candidates?status=UNPROFITABLE"),
        api("/api/candidates?status=DEMAND_NOT_VERIFIED"),
      ]);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                candidates: [
                  ...(a.body.candidates ?? []),
                  ...(b.body.candidates ?? []),
                  ...(c.body.candidates ?? []),
                ],
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    case "get_scan_status": {
      const result = await api("/api/scans");
      return { content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }] };
    }
    case "list_data_source_failures": {
      const result = await api("/api/overview");
      const failures = (result.body.dataSourceHealth ?? []).filter(
        (h: { status: string }) => h.status !== "OK",
      );
      return { content: [{ type: "text", text: JSON.stringify({ failures }, null, 2) }] };
    }
    case "rerun_candidate_analysis": {
      if (!ALLOW_WRITES) return denyWrite();
      const result = await api("/api/scans", {
        method: "POST",
        body: JSON.stringify({ keyword: args.keyword, limit: args.limit ?? 5 }),
      });
      return { content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }] };
    }
    case "export_candidates_to_google_sheets": {
      if (!ALLOW_WRITES) return denyWrite();
      const result = await api("/api/export", {
        method: "POST",
        body: JSON.stringify({ destination: args.destination ?? "csv" }),
      });
      return { content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }] };
    }
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
