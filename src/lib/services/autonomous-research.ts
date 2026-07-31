import path from "path";
import { prisma } from "@/lib/db";
import {
  AUTOMATION_STAGES,
  classifyAutomationDecision,
  DEFAULT_AUTOMATION_CONFIG,
  detectAutomationCapabilities,
  emptyProgress,
  parseAutomationConfig,
  type AutomationProgress,
  type AutomationRunConfig,
  type AutomationStage,
} from "@/lib/domain/automation";
import { CsvExporter } from "@/lib/export/csv";
import { GoogleSheetsApiExporter } from "@/lib/export/google-sheets";
import { logInfo, logWarn } from "@/lib/logger";
import { JobQueue } from "@/lib/jobs/queue";
import {
  createAliExpressProvider,
  createEbayProvider,
  createVisualMatchProvider,
  ensureDefaultWorkspace,
  loadWorkspaceRules,
} from "@/lib/services/providers";
import { ScanOrchestrator } from "@/lib/services/scan-orchestrator";
import { getLatestTrendKeywords } from "@/lib/services/trend-keywords";
import { TrendResearchService } from "@/lib/services/trend-research";

export interface StartAutomationInput {
  topKeywords?: number;
  productsPerKeyword?: number;
  topIdeas?: number;
  searchLimit?: number;
  maxRuntimeMs?: number;
  destination?: "csv" | "google_sheets";
  market?: string;
  keywords?: string[];
}

export class AutonomousResearchOrchestrator {
  async start(input: StartAutomationInput = {}) {
    const workspace = await ensureDefaultWorkspace();
    const config: AutomationRunConfig = {
      ...DEFAULT_AUTOMATION_CONFIG,
      ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && !Array.isArray(value))),
      ...(input.destination ? { destination: input.destination } : {}),
      ...(input.market ? { market: input.market } : {}),
    };
    if (typeof input.topKeywords === "number") config.topKeywords = input.topKeywords;
    if (typeof input.productsPerKeyword === "number") config.productsPerKeyword = input.productsPerKeyword;
    if (typeof input.topIdeas === "number") config.topIdeas = input.topIdeas;
    if (typeof input.searchLimit === "number") config.searchLimit = input.searchLimit;
    if (typeof input.maxRuntimeMs === "number") config.maxRuntimeMs = input.maxRuntimeMs;

    const capabilities = detectAutomationCapabilities();
    const progress = emptyProgress();

    const project = await prisma.searchProject.create({
      data: {
        name: `Automation ${new Date().toISOString().slice(0, 16)}`,
        workspaceId: workspace.id,
        keywords: { create: [{ keyword: "automation" }] },
      },
    });
    const scan = await prisma.scan.create({
      data: {
        projectId: project.id,
        keyword: "automation",
        mode: "autonomous_research",
        status: "RUNNING",
      },
    });

    const run = await prisma.automationRun.create({
      data: {
        workspaceId: workspace.id,
        status: "PENDING",
        configJson: JSON.stringify(config),
        capabilitiesJson: JSON.stringify(capabilities),
        progressJson: JSON.stringify(progress),
        scanId: scan.id,
        stages: {
          create: AUTOMATION_STAGES.map((stage, position) => ({
            stage,
            position,
            status: "PENDING",
          })),
        },
      },
      include: { stages: true },
    });

    if (input.keywords?.length) {
      await this.saveArtifact(run.id, "KEYWORDS", "keyword_override", { keywords: input.keywords });
    }

    const queue = new JobQueue();
    await queue.enqueue(scan.id, "AUTONOMOUS_RESEARCH", { runId: run.id });

    await prisma.auditLog.create({
      data: {
        action: "AUTOMATION_RUN_STARTED",
        entityType: "AutomationRun",
        entityId: run.id,
        detailJson: JSON.stringify({ config, capabilities }),
      },
    });

    logInfo("automation_run_started", { runId: run.id });
    return run;
  }

  async cancel(runId: string) {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    if (["COMPLETED", "CANCELLED", "FAILED"].includes(run.status)) return run;
    return prisma.automationRun.update({
      where: { id: runId },
      data: { status: "CANCELLED", finishedAt: new Date(), error: "Cancelled by operator" },
    });
  }

  async resume(runId: string) {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status === "CANCELLED" || run.status === "FAILED") {
      await prisma.automationRun.update({
        where: { id: runId },
        data: { status: "RUNNING", error: null, finishedAt: null },
      });
      await prisma.automationStageRun.updateMany({
        where: { runId, status: "FAILED" },
        data: { status: "PENDING", error: null },
      });
    }
    return this.advance(runId);
  }

  /**
   * Execute the next pending stage. Safe to call from UI polling or worker tick.
   */
  async advance(runId: string) {
    const run = await prisma.automationRun.findUnique({
      where: { id: runId },
      include: { stages: { orderBy: { position: "asc" } }, artifacts: true, decisions: true },
    });
    if (!run) throw new Error("Automation run not found");
    if (["COMPLETED", "CANCELLED", "AWAITING_APPROVAL", "APPROVED"].includes(run.status)) {
      return this.getRun(runId);
    }

    const config = parseAutomationConfig(run.configJson);
    if (Date.now() - run.startedAt.getTime() > config.maxRuntimeMs) {
      await prisma.automationRun.update({
        where: { id: runId },
        data: { status: "FAILED", error: "Run exceeded maxRuntimeMs budget", finishedAt: new Date() },
      });
      return this.getRun(runId);
    }

    if (run.status === "PENDING") {
      await prisma.automationRun.update({ where: { id: runId }, data: { status: "RUNNING" } });
    }

    // Concurrent UI polls must not start the next stage while one is still RUNNING.
    if (run.stages.some((stage) => stage.status === "RUNNING")) {
      return this.getRun(runId);
    }

    const next = run.stages.find((stage) => stage.status === "PENDING");
    if (!next) {
      return this.getRun(runId);
    }

    await prisma.automationStageRun.update({
      where: { id: next.id },
      data: {
        status: "RUNNING",
        attempt: { increment: 1 },
        startedAt: new Date(),
        error: null,
      },
    });
    await this.patchProgress(runId, { stage: next.stage as AutomationStage });

    try {
      const output = await this.executeStage(runId, next.stage as AutomationStage, config);
      await prisma.automationStageRun.update({
        where: { id: next.id },
        data: {
          status: next.stage === "APPROVAL" ? "WAITING" : "COMPLETED",
          outputJson: JSON.stringify(output ?? {}),
          finishedAt: next.stage === "APPROVAL" ? null : new Date(),
          progressCurrent: output?.progressCurrent ?? 1,
          progressTotal: output?.progressTotal ?? 1,
        },
      });

      if (next.stage === "APPROVAL") {
        await prisma.automationRun.update({
          where: { id: runId },
          data: { status: "AWAITING_APPROVAL" },
        });
      } else if (next.stage === "EXPORT") {
        await prisma.automationRun.update({
          where: { id: runId },
          data: { status: "COMPLETED", finishedAt: new Date() },
        });
      }

      return this.getRun(runId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stage = await prisma.automationStageRun.findUniqueOrThrow({ where: { id: next.id } });
      if (stage.attempt >= stage.maxAttempts) {
        await prisma.automationStageRun.update({
          where: { id: next.id },
          data: { status: "FAILED", error: message, finishedAt: new Date() },
        });
        await prisma.automationRun.update({
          where: { id: runId },
          data: { status: "FAILED", error: message, finishedAt: new Date() },
        });
        logWarn("automation_stage_failed", { runId, stage: next.stage, message });
      } else {
        await prisma.automationStageRun.update({
          where: { id: next.id },
          data: { status: "PENDING", error: message },
        });
      }
      return this.getRun(runId);
    }
  }

  async approve(
    runId: string,
    input: {
      candidateIds: string[];
      demandByCandidateId?: Record<
        string,
        {
          soldLast30Days: number;
          avgCompletedSaleMinor?: number;
          medianCompletedSaleMinor?: number;
          evidenceUrl?: string;
          notes?: string;
        }
      >;
      actor?: string;
    },
  ) {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== "AWAITING_APPROVAL" && run.status !== "APPROVED") {
      throw new Error(`Run cannot be approved from status ${run.status}`);
    }

    const rules = await loadWorkspaceRules();
    const scan = new ScanOrchestrator({
      aliexpress: createAliExpressProvider(),
      ebay: createEbayProvider(),
      visualMatch: createVisualMatchProvider(),
      rules,
    });

    const approvedIds: string[] = [];
    for (const candidateId of input.candidateIds) {
      const demand = input.demandByCandidateId?.[candidateId];
      if (demand) {
        await scan.applyManualDemand(candidateId, {
          ...demand,
          verifiedBy: input.actor ?? "automation-operator",
        });
      } else {
        const candidate = await prisma.productCandidate.findUniqueOrThrow({ where: { id: candidateId } });
        if (candidate.status === "APPROVED") {
          // already export-ready
        } else if (
          candidate.demandVerified &&
          candidate.aliexpressShippingMinor != null &&
          candidate.aliexpressProductId &&
          candidate.status === "EBAY_MATCHED"
        ) {
          await prisma.productCandidate.update({
            where: { id: candidateId },
            data: { status: "APPROVED" },
          });
        } else {
          throw new Error(`Candidate ${candidateId} requires demand evidence before approval`);
        }
      }
      const refreshed = await prisma.productCandidate.findUniqueOrThrow({ where: { id: candidateId } });
      if (refreshed.status === "APPROVED") approvedIds.push(candidateId);
      await prisma.automationDecision.updateMany({
        where: { runId, candidateId },
        data: { selected: true },
      });
    }

    await this.saveArtifact(runId, "APPROVAL", "approved_candidate_ids", { candidateIds: approvedIds });
    await prisma.automationStageRun.updateMany({
      where: { runId, stage: "APPROVAL" },
      data: { status: "COMPLETED", finishedAt: new Date(), outputJson: JSON.stringify({ approvedIds }) },
    });
    await prisma.automationStageRun.updateMany({
      where: { runId, stage: "EXPORT", status: { in: ["PENDING", "WAITING"] } },
      data: { status: "PENDING" },
    });

    const updated = await prisma.automationRun.update({
      where: { id: runId },
      data: { status: "APPROVED" },
    });

    await prisma.auditLog.create({
      data: {
        action: "AUTOMATION_RUN_APPROVED",
        entityType: "AutomationRun",
        entityId: runId,
        detailJson: JSON.stringify({ approvedIds, actor: input.actor ?? "automation-operator" }),
      },
    });

    return updated;
  }

  async export(runId: string) {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    if (!["APPROVED", "EXPORTING", "COMPLETED"].includes(run.status)) {
      throw new Error(`Run cannot export from status ${run.status}`);
    }
    const config = parseAutomationConfig(run.configJson);
    await prisma.automationRun.update({ where: { id: runId }, data: { status: "EXPORTING" } });

    const approvedArtifact = await prisma.automationArtifact.findFirst({
      where: { runId, kind: "approved_candidate_ids" },
      orderBy: { createdAt: "desc" },
    });
    const approvedIds = approvedArtifact
      ? ((JSON.parse(approvedArtifact.payloadJson) as { candidateIds?: string[] }).candidateIds ?? [])
      : [];

    const rules = await loadWorkspaceRules();
    const scan = new ScanOrchestrator({
      aliexpress: createAliExpressProvider(),
      ebay: createEbayProvider(),
      visualMatch: createVisualMatchProvider(),
      rules,
    });
    const exporter =
      config.destination === "google_sheets"
        ? new GoogleSheetsApiExporter({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ?? "" })
        : new CsvExporter(path.join(process.cwd(), "poc-output", `automation-${runId}.csv`));

    const result = await scan.exportApproved(exporter, approvedIds.length ? { candidateIds: approvedIds } : undefined);

    await this.saveArtifact(runId, "EXPORT", "export_result", result);
    await prisma.automationStageRun.updateMany({
      where: { runId, stage: "EXPORT" },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        finishedAt: new Date(),
        outputJson: JSON.stringify(result),
        error: result.error ?? null,
      },
    });
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        exportResultJson: JSON.stringify(result),
        finishedAt: new Date(),
        error: result.success ? null : (result.error ?? "Export failed"),
        summaryJson: JSON.stringify({ exported: result.success, destination: config.destination }),
      },
    });
    await this.patchProgress(runId, { exported: approvedIds.length || (result.success ? 1 : 0), stage: "EXPORT" });

    return this.getRun(runId);
  }

  async getRun(runId: string) {
    return prisma.automationRun.findUniqueOrThrow({
      where: { id: runId },
      include: {
        stages: { orderBy: { position: "asc" } },
        artifacts: { orderBy: { createdAt: "desc" } },
        decisions: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async listRuns(limit = 20) {
    return prisma.automationRun.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        stages: { orderBy: { position: "asc" } },
        _count: { select: { decisions: true, artifacts: true } },
      },
    });
  }

  private async executeStage(runId: string, stage: AutomationStage, config: AutomationRunConfig) {
    switch (stage) {
      case "KEYWORDS":
        return this.stageKeywords(runId, config);
      case "EBAY_DISCOVERY":
        return this.stageEbayDiscovery(runId, config);
      case "SOURCE_MATCH":
        return this.stageSourceMatch(runId, config);
      case "DECISION":
        return this.stageDecision(runId);
      case "APPROVAL":
        return { waiting: true, progressCurrent: 0, progressTotal: 1 };
      case "EXPORT":
        return this.stageExportAuto(runId);
      default:
        throw new Error(`Unknown stage ${stage}`);
    }
  }

  private async stageKeywords(runId: string, config: AutomationRunConfig) {
    const override = await prisma.automationArtifact.findFirst({
      where: { runId, kind: "keyword_override" },
      orderBy: { createdAt: "desc" },
    });
    let keywords: string[] = [];
    if (override) {
      keywords = ((JSON.parse(override.payloadJson) as { keywords?: string[] }).keywords ?? []).slice(0, config.topKeywords);
    } else {
      const library = await getLatestTrendKeywords(config.market);
      keywords = library.keywords
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .slice(0, config.topKeywords)
        .map((entry) => entry.keyword);
    }
    if (keywords.length === 0) throw new Error("No keywords available for automation run");
    await this.saveArtifact(runId, "KEYWORDS", "keyword_set", { keywords });
    await this.patchProgress(runId, { keywordsSelected: keywords.length });
    return { keywords, progressCurrent: keywords.length, progressTotal: config.topKeywords };
  }

  private async stageEbayDiscovery(runId: string, config: AutomationRunConfig) {
    const keywordArtifact = await prisma.automationArtifact.findFirst({
      where: { runId, kind: "keyword_set" },
      orderBy: { createdAt: "desc" },
    });
    if (!keywordArtifact) throw new Error("Missing keyword_set artifact");
    const { keywords } = JSON.parse(keywordArtifact.payloadJson) as { keywords: string[] };
    const service = new TrendResearchService(createEbayProvider());
    const result = await service.run({
      keywords,
      searchLimit: config.searchLimit,
      criteria: { topNPerKeyword: config.productsPerKeyword },
    });
    const ideaIds = result.ideas
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, config.topIdeas)
      .map((idea) => idea.id);
    await prisma.automationRun.update({ where: { id: runId }, data: { trendRunId: result.runId } });
    await this.saveArtifact(runId, "EBAY_DISCOVERY", "idea_ids", { runId: result.runId, ideaIds });
    await this.patchProgress(runId, { ideasFound: ideaIds.length });
    return { trendRunId: result.runId, ideaIds, progressCurrent: ideaIds.length, progressTotal: config.topIdeas };
  }

  private async stageSourceMatch(runId: string, config: AutomationRunConfig) {
    const ideaArtifact = await prisma.automationArtifact.findFirst({
      where: { runId, kind: "idea_ids" },
      orderBy: { createdAt: "desc" },
    });
    if (!ideaArtifact) throw new Error("Missing idea_ids artifact");
    const { ideaIds } = JSON.parse(ideaArtifact.payloadJson) as { ideaIds: string[] };
    const rules = await loadWorkspaceRules();
    const orchestrator = new ScanOrchestrator({
      aliexpress: createAliExpressProvider(),
      ebay: createEbayProvider(),
      visualMatch: createVisualMatchProvider(),
      rules,
    });
    const matched = await orchestrator.matchTrendIdeas(ideaIds.slice(0, config.topIdeas));
    const candidateIds = matched.candidates.map((candidate) => candidate.id);
    const scanId = matched.candidates[0]?.scanId;
    if (scanId) {
      await prisma.automationRun.update({ where: { id: runId }, data: { scanId } });
    }
    await this.saveArtifact(runId, "SOURCE_MATCH", "candidate_ids", { candidateIds });
    await this.patchProgress(runId, { candidatesCreated: candidateIds.length });
    return { candidateIds, progressCurrent: candidateIds.length, progressTotal: ideaIds.length };
  }

  private async stageDecision(runId: string) {
    const candidateArtifact = await prisma.automationArtifact.findFirst({
      where: { runId, kind: "candidate_ids" },
      orderBy: { createdAt: "desc" },
    });
    if (!candidateArtifact) throw new Error("Missing candidate_ids artifact");
    const { candidateIds } = JSON.parse(candidateArtifact.payloadJson) as { candidateIds: string[] };
    const rules = await loadWorkspaceRules();
    const candidates = await prisma.productCandidate.findMany({ where: { id: { in: candidateIds } } });
    const ideas = await prisma.trendIdea.findMany({ where: { productCandidateId: { in: candidateIds } } });
    const ideaByCandidate = new Map(ideas.map((idea) => [idea.productCandidateId!, idea.id]));

    await prisma.automationDecision.deleteMany({ where: { runId } });
    let ready = 0;
    let needsEvidence = 0;
    let rejected = 0;
    for (const candidate of candidates) {
      const classified = classifyAutomationDecision({
        status: candidate.status,
        aliexpressProductId: candidate.aliexpressProductId,
        matchConfidence: candidate.matchConfidence,
        aliexpressShippingMinor: candidate.aliexpressShippingMinor,
        demandVerified: candidate.demandVerified,
        rejectionReasonsJson: candidate.rejectionReasonsJson,
        minimumMatchConfidence: rules.minimumMatchConfidence,
      });
      if (classified.outcome === "READY_FOR_APPROVAL") ready += 1;
      if (classified.outcome === "NEEDS_EVIDENCE") needsEvidence += 1;
      if (classified.outcome === "REJECTED") rejected += 1;
      await prisma.automationDecision.create({
        data: {
          runId,
          candidateId: candidate.id,
          ideaId: ideaByCandidate.get(candidate.id) ?? null,
          outcome: classified.outcome,
          reasonsJson: JSON.stringify(classified.reasons),
          evidenceJson: JSON.stringify({
            status: candidate.status,
            matchConfidence: candidate.matchConfidence,
            aliexpressProductId: candidate.aliexpressProductId,
            aliexpressShippingMinor: candidate.aliexpressShippingMinor,
            demandVerified: candidate.demandVerified,
            netMarginPercent: candidate.netMarginPercent,
            orderCount: candidate.orderCount,
            rating: candidate.rating,
          }),
        },
      });
    }
    await this.patchProgress(runId, { readyForApproval: ready, needsEvidence, rejected });
    return { ready, needsEvidence, rejected, progressCurrent: candidates.length, progressTotal: candidates.length };
  }

  private async stageExportAuto(runId: string) {
    // Export is explicit via /export after approval; auto-skip until approved artifact exists.
    const approved = await prisma.automationArtifact.findFirst({
      where: { runId, kind: "approved_candidate_ids" },
    });
    if (!approved) {
      throw new Error("Export stage reached without approved_candidate_ids; call approve then export");
    }
    const run = await this.export(runId);
    return { runStatus: run.status, progressCurrent: 1, progressTotal: 1 };
  }

  private async saveArtifact(runId: string, stage: AutomationStage | null, kind: string, payload: unknown) {
    return prisma.automationArtifact.create({
      data: {
        runId,
        stage: stage ?? undefined,
        kind,
        payloadJson: JSON.stringify(payload),
      },
    });
  }

  private async patchProgress(runId: string, patch: Partial<AutomationProgress>) {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    const current = run.progressJson ? (JSON.parse(run.progressJson) as AutomationProgress) : emptyProgress();
    await prisma.automationRun.update({
      where: { id: runId },
      data: { progressJson: JSON.stringify({ ...current, ...patch }) },
    });
  }
}

export async function processAutomationJobs(queue = new JobQueue({ concurrency: 1 })) {
  await queue.processDue({
    AUTONOMOUS_RESEARCH: async (payload) => {
      const runId = (payload as { runId?: string })?.runId;
      if (!runId) throw new Error("AUTONOMOUS_RESEARCH payload missing runId");
      const orchestrator = new AutonomousResearchOrchestrator();
      // Drain pending stages until waiting/terminal.
      for (let i = 0; i < AUTOMATION_STAGES.length + 2; i += 1) {
        const run = await orchestrator.advance(runId);
        if (["AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "APPROVED"].includes(run.status)) {
          return { runId, status: run.status };
        }
      }
      return { runId, status: "RUNNING" };
    },
  });
}
