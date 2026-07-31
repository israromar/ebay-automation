import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { JobQueue, nextCronRun, syncSchedules } from "@/lib/jobs/queue";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  cron: z.string().min(1),
  keyword: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const schedules = await prisma.scheduleConfig.findMany({ orderBy: { createdAt: "desc" } });
  const jobs = await prisma.scanJob.findMany({
    where: { scan: { project: { workspaceId: session.workspace.id } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ schedules, jobs });
}

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const json = await req.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const schedule = await prisma.scheduleConfig.create({
    data: {
      name: parsed.data.name,
      cron: parsed.data.cron,
      keyword: parsed.data.keyword,
      enabled: parsed.data.enabled ?? true,
      nextRunAt: nextCronRun(parsed.data.cron),
    },
  });
  return NextResponse.json({ schedule });
}

export async function PUT(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;

  const json = await req.json();
  if (json.action === "tick") {
    const due = await syncSchedules();
    const queue = new JobQueue({ concurrency: 2, domainDelayMs: 500 });
    // Handlers wired by worker script; tick only advances schedule metadata here.
    await queue.processDue({});
    return NextResponse.json({ due });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
