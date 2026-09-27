import type { Hunt } from "@prisma/client";

export function serializeHunt(hunt: Hunt) {
  const { payloadJson, logJson, ...rest } = hunt;
  const payload = JSON.parse(payloadJson) as unknown[];
  return {
    ...rest,
    keywords: hunt.kind === "KEYWORDS" ? (payload as string[]) : [],
    log: JSON.parse(logJson || "[]") as Array<{ at: string; message: string }>,
  };
}
