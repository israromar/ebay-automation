export const AUTOMATION_STAGES = ["KEYWORDS", "EBAY_DISCOVERY", "SOURCE_MATCH", "DECISION", "APPROVAL", "EXPORT"] as const;

export type AutomationStage = (typeof AUTOMATION_STAGES)[number];

export const AUTOMATION_RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "AWAITING_APPROVAL",
  "APPROVED",
  "EXPORTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export const AUTOMATION_STAGE_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED", "WAITING"] as const;

export type AutomationStageStatus = (typeof AUTOMATION_STAGE_STATUSES)[number];

export const AUTOMATION_DECISION_OUTCOMES = ["READY_FOR_APPROVAL", "NEEDS_EVIDENCE", "REJECTED"] as const;

export type AutomationDecisionOutcome = (typeof AUTOMATION_DECISION_OUTCOMES)[number];

export interface AutomationRunConfig {
  topKeywords: number;
  productsPerKeyword: number;
  topIdeas: number;
  searchLimit: number;
  maxRuntimeMs: number;
  destination: "csv" | "google_sheets";
  market: string;
}

export const DEFAULT_AUTOMATION_CONFIG: AutomationRunConfig = {
  topKeywords: 5,
  productsPerKeyword: 8,
  topIdeas: 15,
  searchLimit: 30,
  maxRuntimeMs: 15 * 60_000,
  destination: "csv",
  market: "US",
};

export interface AutomationCapabilities {
  aliexpressOfficial: boolean;
  aliexpressImageSearch: boolean;
  aliexpressSmartMatch: boolean;
  aliexpressHotProducts: boolean;
  ebayCredentials: boolean;
  ebayInsights: boolean;
  visualMatch: boolean;
  googleSheets: boolean;
}

export interface AutomationProgress {
  stage: AutomationStage | null;
  keywordsSelected: number;
  ideasFound: number;
  candidatesCreated: number;
  readyForApproval: number;
  needsEvidence: number;
  rejected: number;
  exported: number;
}

export function parseAutomationConfig(raw: string): AutomationRunConfig {
  try {
    return { ...DEFAULT_AUTOMATION_CONFIG, ...(JSON.parse(raw) as Partial<AutomationRunConfig>) };
  } catch {
    return { ...DEFAULT_AUTOMATION_CONFIG };
  }
}

export function emptyProgress(): AutomationProgress {
  return {
    stage: null,
    keywordsSelected: 0,
    ideasFound: 0,
    candidatesCreated: 0,
    readyForApproval: 0,
    needsEvidence: 0,
    rejected: 0,
    exported: 0,
  };
}

export function detectAutomationCapabilities(): AutomationCapabilities {
  return {
    aliexpressOfficial: Boolean(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET),
    aliexpressImageSearch: process.env.ALIEXPRESS_IMAGE_SEARCH_ENABLED === "true",
    aliexpressSmartMatch: process.env.ALIEXPRESS_SMARTMATCH_ENABLED !== "false",
    aliexpressHotProducts: process.env.ALIEXPRESS_HOTPRODUCT_ENABLED !== "false",
    ebayCredentials: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
    ebayInsights: process.env.EBAY_INSIGHTS_ENABLED !== "false",
    visualMatch: process.env.VISUAL_MATCH_ENABLED !== "false",
    googleSheets: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SPREADSHEET_ID),
  };
}

/** Classify a matched candidate for the final human gate. */
export function classifyAutomationDecision(input: {
  status: string;
  aliexpressProductId?: string | null;
  matchConfidence?: number | null;
  aliexpressShippingMinor?: number | null;
  demandVerified?: boolean | null;
  rejectionReasonsJson?: string | null;
  minimumMatchConfidence: number;
}): { outcome: AutomationDecisionOutcome; reasons: string[] } {
  const reasons = parseJsonStringArray(input.rejectionReasonsJson);
  if (!input.aliexpressProductId || input.status === "ALIEXPRESS_REJECTED") {
    return { outcome: "REJECTED", reasons: reasons.length ? reasons : ["NO_QUALIFIED_ALIEXPRESS_SOURCE"] };
  }
  if ((input.matchConfidence ?? 0) < input.minimumMatchConfidence) {
    return { outcome: "REJECTED", reasons: [...new Set([...reasons, "MATCH_CONFIDENCE_TOO_LOW"])] };
  }
  if (["UNPROFITABLE", "DEMAND_NOT_VERIFIED"].includes(input.status)) {
    return { outcome: "REJECTED", reasons: reasons.length ? reasons : [input.status] };
  }
  if (input.aliexpressShippingMinor == null || reasons.includes("MISSING_SHIPPING_COST")) {
    return { outcome: "NEEDS_EVIDENCE", reasons: [...new Set([...reasons, "MISSING_SHIPPING_COST"])] };
  }
  if (!input.demandVerified || input.status === "NEEDS_MANUAL_VALIDATION" || reasons.includes("EBAY_SOLD_HISTORY_UNAVAILABLE")) {
    return { outcome: "NEEDS_EVIDENCE", reasons: [...new Set([...reasons, "EBAY_SOLD_HISTORY_UNAVAILABLE"])] };
  }
  if (input.status === "APPROVED" || input.status === "EBAY_MATCHED") {
    return { outcome: "READY_FOR_APPROVAL", reasons };
  }
  return { outcome: "NEEDS_EVIDENCE", reasons: reasons.length ? reasons : ["MANUAL_INTERVENTION_REQUIRED"] };
}

function parseJsonStringArray(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
