import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit") ?? 50);
  const candidates = await prisma.productCandidate.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
    take: Math.min(limit, 200),
  });
  return NextResponse.json({ candidates });
}
