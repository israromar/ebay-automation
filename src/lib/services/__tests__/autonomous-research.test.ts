import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const state = {
    runs: [] as Array<Record<string, unknown>>,
    stages: [] as Array<Record<string, unknown>>,
    artifacts: [] as Array<Record<string, unknown>>,
    decisions: [] as Array<Record<string, unknown>>,
    jobs: [] as Array<Record<string, unknown>>,
  };

  const automationRun = {
    create: vi.fn(async ({ data, include }: { data: Record<string, unknown>; include?: unknown }) => {
      const id = `run_${state.runs.length + 1}`;
      const stages = ((data.stages as { create: Array<{ stage: string; status: string }> })?.create ?? []).map((stage, index) => ({
        id: `stage_${id}_${index}`,
        runId: id,
        ...stage,
        attempt: 0,
        maxAttempts: 3,
        progressCurrent: 0,
        progressTotal: 0,
        createdAt: new Date(),
      }));
      const run = {
        id,
        ...data,
        stages,
        artifacts: [],
        decisions: [],
        startedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.runs.push(run);
      state.stages.push(...stages);
      return include ? run : run;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const run = state.runs.find((entry) => entry.id === where.id);
      if (!run) return null;
      return {
        ...run,
        stages: state.stages.filter((stage) => stage.runId === where.id),
        artifacts: state.artifacts.filter((artifact) => artifact.runId === where.id),
        decisions: state.decisions.filter((decision) => decision.runId === where.id),
      };
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const run = await automationRun.findUnique({ where });
      if (!run) throw new Error("not found");
      return run;
    }),
    findMany: vi.fn(async () => state.runs),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const index = state.runs.findIndex((entry) => entry.id === where.id);
      state.runs[index] = { ...state.runs[index], ...data };
      return state.runs[index];
    }),
  };

  return {
    state,
    prisma: {
      automationRun,
      automationStageRun: {
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const index = state.stages.findIndex((stage) => stage.id === where.id);
          const current = state.stages[index] as Record<string, unknown>;
          const next = {
            ...current,
            ...data,
            attempt:
              data.attempt && typeof data.attempt === "object" ? Number(current.attempt ?? 0) + 1 : (data.attempt ?? current.attempt),
          };
          state.stages[index] = next;
          return next;
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
          const stage = state.stages.find((entry) => entry.id === where.id);
          if (!stage) throw new Error("stage missing");
          return stage;
        }),
      },
      automationArtifact: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const artifact = { id: `artifact_${state.artifacts.length + 1}`, createdAt: new Date(), ...data };
          state.artifacts.push(artifact);
          return artifact;
        }),
        findFirst: vi.fn(async ({ where }: { where: { runId: string; kind: string } }) => {
          return [...state.artifacts].reverse().find((artifact) => artifact.runId === where.runId && artifact.kind === where.kind) ?? null;
        }),
      },
      automationDecision: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const decision = { id: `decision_${state.decisions.length + 1}`, createdAt: new Date(), ...data };
          state.decisions.push(decision);
          return decision;
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findMany: vi.fn(async () => state.decisions),
      },
      searchProject: {
        create: vi.fn(async () => ({ id: "project_1" })),
      },
      scan: {
        create: vi.fn(async () => ({ id: "scan_1" })),
      },
      scanJob: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const job = { id: `job_${state.jobs.length + 1}`, ...data };
          state.jobs.push(job);
          return job;
        }),
      },
      auditLog: {
        create: vi.fn(async () => ({ id: "audit_1" })),
      },
      productCandidate: {
        findMany: vi.fn(async () => []),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
      trendIdea: {
        findMany: vi.fn(async () => []),
      },
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: prismaMock.prisma }));
vi.mock("@/lib/services/providers", () => ({
  ensureDefaultWorkspace: vi.fn(async () => ({ id: "ws_1" })),
  createAliExpressProvider: vi.fn(),
  createEbayProvider: vi.fn(),
  createVisualMatchProvider: vi.fn(),
  loadWorkspaceRules: vi.fn(async () => ({ minimumMatchConfidence: 70 })),
}));
vi.mock("@/lib/services/trend-keywords", () => ({
  getLatestTrendKeywords: vi.fn(async () => ({
    keywords: [
      { rank: 1, keyword: "neck stretcher" },
      { rank: 2, keyword: "resistance bands" },
    ],
  })),
}));
vi.mock("@/lib/services/trend-research", () => ({
  TrendResearchService: class {
    async run() {
      return {
        runId: "trend_1",
        ideas: [
          { id: "idea_1", score: 90 },
          { id: "idea_2", score: 80 },
        ],
      };
    }
  },
}));
vi.mock("@/lib/services/scan-orchestrator", () => ({
  ScanOrchestrator: class {
    async matchTrendIdeas() {
      return {
        candidates: [
          {
            id: "cand_1",
            scanId: "scan_match_1",
            status: "NEEDS_MANUAL_VALIDATION",
            aliexpressProductId: "ae_1",
            matchConfidence: 85,
            aliexpressShippingMinor: 100,
            demandVerified: false,
            rejectionReasonsJson: JSON.stringify(["EBAY_SOLD_HISTORY_UNAVAILABLE"]),
          },
        ],
      };
    }
    async applyManualDemand() {
      return { id: "cand_1", status: "APPROVED" };
    }
    async exportApproved() {
      return { success: true, spreadsheetId: null, rowRange: "A1", error: null, name: "CsvExporter" };
    }
  },
}));
vi.mock("@/lib/export/csv", () => ({
  CsvExporter: class {
    name = "CsvExporter";
  },
}));
vi.mock("@/lib/export/google-sheets", () => ({
  GoogleSheetsApiExporter: class {
    name = "GoogleSheetsApiExporter";
  },
}));
vi.mock("@/lib/logger", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import { AutonomousResearchOrchestrator } from "@/lib/services/autonomous-research";

describe("AutonomousResearchOrchestrator", () => {
  beforeEach(() => {
    prismaMock.state.runs.length = 0;
    prismaMock.state.stages.length = 0;
    prismaMock.state.artifacts.length = 0;
    prismaMock.state.decisions.length = 0;
    prismaMock.state.jobs.length = 0;
    vi.clearAllMocks();
  });

  it("starts a run with staged pipeline and job enqueue", async () => {
    const orchestrator = new AutonomousResearchOrchestrator();
    const run = await orchestrator.start({ topKeywords: 2, topIdeas: 2 });
    expect(run.id).toBeTruthy();
    expect(prismaMock.state.stages).toHaveLength(6);
    expect(prismaMock.state.stages.map((stage) => [stage.stage, stage.position])).toEqual([
      ["KEYWORDS", 0],
      ["EBAY_DISCOVERY", 1],
      ["SOURCE_MATCH", 2],
      ["DECISION", 3],
      ["APPROVAL", 4],
      ["EXPORT", 5],
    ]);
    expect(prismaMock.prisma.scanJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "AUTONOMOUS_RESEARCH" }),
      }),
    );
  });

  it("advances keyword and discovery stages using artifacts", async () => {
    const orchestrator = new AutonomousResearchOrchestrator();
    const started = await orchestrator.start({ topKeywords: 2, topIdeas: 2 });

    // Make findUnique return mutable stage list from state each time.
    const afterKeywords = await orchestrator.advance(started.id as string);
    expect(afterKeywords.status).toBe("RUNNING");
    expect(prismaMock.state.artifacts.some((artifact) => artifact.kind === "keyword_set")).toBe(true);

    const afterDiscovery = await orchestrator.advance(started.id as string);
    expect(prismaMock.state.artifacts.some((artifact) => artifact.kind === "idea_ids")).toBe(true);
    expect(afterDiscovery).toBeTruthy();
  });
});
