import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const workspaceFilter = { scan: { project: { workspaceId: session.workspace.id } } };

  const [total, approved, rejected, needsManual, avgMargin, avgSales, lastScan, health] = await Promise.all([
    prisma.productCandidate.count({ where: workspaceFilter }),
    prisma.productCandidate.count({ where: { ...workspaceFilter, status: "APPROVED" } }),
    prisma.productCandidate.count({
      where: {
        ...workspaceFilter,
        status: {
          in: ["ALIEXPRESS_REJECTED", "UNPROFITABLE", "DEMAND_NOT_VERIFIED"],
        },
      },
    }),
    prisma.productCandidate.count({ where: { ...workspaceFilter, status: "NEEDS_MANUAL_VALIDATION" } }),
    prisma.productCandidate.aggregate({ where: workspaceFilter, _avg: { netMarginPercent: true } }),
    prisma.productCandidate.aggregate({ where: workspaceFilter, _avg: { soldLast30Days: true } }),
    prisma.scan.findFirst({
      where: { project: { workspaceId: session.workspace.id } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.dataSourceHealthEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    totalCandidates: total,
    approvedCandidates: approved,
    rejectedCandidates: rejected,
    awaitingManualValidation: needsManual,
    averageMargin: avgMargin._avg.netMarginPercent,
    averageRecentSales: avgSales._avg.soldLast30Days,
    lastScanTime: lastScan?.startedAt ?? null,
    lastScanStatus: lastScan?.status ?? null,
    dataSourceHealth: health,
  });
}
