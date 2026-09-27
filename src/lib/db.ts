import { Prisma, PrismaClient } from "@prisma/client";

/** Model delegates the app needs. A client generated from an older schema lacks them. */
const REQUIRED_DELEGATES = ["huntSettings", "hunt", "trackedListing", "soldSnapshot", "sourceMatch"] as const;

export class PrismaSchemaOutdatedError extends Error {
  override name = "PrismaSchemaOutdatedError";
  constructor() {
    super(
      "Prisma client is out of date for this schema. Stop the dev server, run `npx prisma generate && npx prisma migrate deploy`, then start it again.",
    );
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaFingerprint?: string };

function schemaFingerprint(): string {
  return Prisma.dmmf.datamodel.models.map((m) => `${m.name}:${m.fields.map((f) => f.name).join(",")}`).join("|");
}

function hasDelegates(client: PrismaClient): boolean {
  const c = client as unknown as Record<string, { findMany?: unknown } | undefined>;
  return REQUIRED_DELEGATES.every((name) => typeof c[name]?.findMany === "function");
}

/**
 * One client per process. In `next dev`, a client cached on globalThis survives HMR,
 * so after pulling a schema change it can be an old client missing new models —
 * replace it once when the generated schema changes instead of failing with
 * "Cannot read properties of undefined".
 */
function getPrisma(): PrismaClient {
  const fingerprint = schemaFingerprint();
  const cached = globalForPrisma.prisma;
  if (cached && globalForPrisma.prismaFingerprint === fingerprint && hasDelegates(cached)) return cached;

  if (cached) void cached.$disconnect().catch(() => undefined);
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  if (!hasDelegates(client)) throw new PrismaSchemaOutdatedError();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaFingerprint = fingerprint;
  return client;
}

/** Resolves the process-wide client lazily, so a stale cached client is swapped before use. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Turn common setup mistakes into actionable messages. */
export function describeDatabaseError(error: unknown): string | null {
  if (error instanceof PrismaSchemaOutdatedError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return "Database schema is behind the app. Run `npx prisma migrate deploy` (see docs/deploy-supabase-vercel.md), then retry.";
    }
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return `Cannot connect to the database: check DATABASE_URL / DIRECT_URL. (${error.message.split("\n").pop()?.trim()})`;
  }
  return null;
}
