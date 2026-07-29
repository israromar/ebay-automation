import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

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
  };
  return typeof c.trendIdea?.findMany === "function" && typeof c.trendResearchRun?.findMany === "function" && typeof c.trendKeyword?.findMany === "function" && typeof c.trendKeywordSnapshot?.findFirst === "function";
}

function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  // After `prisma generate`, Next HMR can keep a pre-schema PrismaClient on globalThis.
  if (existing && hasRequiredDelegates(existing)) {
    return existing;
  }
  if (existing) {
    globalForPrisma.prisma = undefined;
    void existing.$disconnect().catch(() => undefined);
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

/**
 * Lazy proxy so each access re-validates after schema regenerate.
 * Avoids sticky HMR singletons missing new model delegates.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
