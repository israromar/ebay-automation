import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function hasTrendDelegates(client: PrismaClient): boolean {
  return typeof (client as { trendIdea?: { findMany?: unknown } }).trendIdea?.findMany === "function" && typeof (client as { trendResearchRun?: { findMany?: unknown } }).trendResearchRun?.findMany === "function";
}

function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  // After `prisma generate`, Next HMR can keep a pre-schema PrismaClient on globalThis.
  if (existing && hasTrendDelegates(existing)) {
    return existing;
  }
  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrisma();
