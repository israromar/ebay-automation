import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaFingerprint?: string;
};

function schemaFingerprint(): string {
  return Prisma.dmmf.datamodel.models.map((model) => `${model.name}:${model.fields.map((field) => field.name).join(",")}`).join("|");
}

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function hasRequiredDelegates(client: PrismaClient): boolean {
  const c = client as {
    trendIdea?: { findMany?: unknown };
    trendResearchRun?: { findMany?: unknown };
    trendKeyword?: { findMany?: unknown };
    trendKeywordSnapshot?: { findFirst?: unknown };
    automationRun?: { findMany?: unknown };
    automationStageRun?: { findMany?: unknown };
    automationArtifact?: { findFirst?: unknown };
    automationDecision?: { findMany?: unknown };
  };
  return (
    typeof c.trendIdea?.findMany === "function" &&
    typeof c.trendResearchRun?.findMany === "function" &&
    typeof c.trendKeyword?.findMany === "function" &&
    typeof c.trendKeywordSnapshot?.findFirst === "function" &&
    typeof c.automationRun?.findMany === "function" &&
    typeof c.automationStageRun?.findMany === "function" &&
    typeof c.automationArtifact?.findFirst === "function" &&
    typeof c.automationDecision?.findMany === "function"
  );
}

/** Drop the cached client so the next access opens a fresh connection (helps after P1001). */
export async function resetPrismaClient() {
  const existing = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaSchemaFingerprint = undefined;
  if (existing) {
    await existing.$disconnect().catch(() => undefined);
  }
}

function getPrisma(): PrismaClient {
  const fingerprint = schemaFingerprint();
  const existing = globalForPrisma.prisma;
  // After `prisma generate`, Next HMR can keep a pre-schema PrismaClient on globalThis.
  if (existing && globalForPrisma.prismaSchemaFingerprint === fingerprint && hasRequiredDelegates(existing)) {
    return existing;
  }
  if (existing) {
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaSchemaFingerprint = undefined;
    void existing.$disconnect().catch(() => undefined);
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaSchemaFingerprint = fingerprint;
  }
  return client;
}

/**
 * Lazy proxy so each access re-validates after schema regenerate.
 * Avoids sticky HMR singletons missing new model delegates or fields.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function isPrismaConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "P1001" || code === "P1017" || /Can't reach database server/i.test(message);
}
