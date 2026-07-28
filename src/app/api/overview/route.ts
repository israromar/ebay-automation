import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [total, approved, rejected, needsManual, avgMargin, avgSales, lastScan, health] = await Promise.all([
    prisma.productCandidate.count(),
    prisma.productCandidate.count({ where: { status: "APPROVED" } }),
    prisma.productCandidate.count({
      where: {
        status: {
          in: ["ALIEXPRESS_REJECTED", "UNPROFITABLE", "DEMAND_NOT_VERIFIED"],
        },
      },
    }),
    prisma.productCandidate.count({ where: { status: "NEEDS_MANUAL_VALIDATION" } }),
    prisma.productCandidate.aggregate({ _avg: { netMarginPercent: true } }),
    prisma.productCandidate.aggregate({ _avg: { soldLast30Days: true } }),
    prisma.scan.findFirst({ orderBy: { startedAt: "desc" } }),
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
