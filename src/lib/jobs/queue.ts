import { prisma } from "@/lib/db";
import { logInfo, logWarn } from "@/lib/logger";

export interface JobHandler {
  (payload: unknown): Promise<unknown>;
}

/**
 * Lightweight DB-backed job queue with exponential backoff, concurrency limits,
 * cancellation, and dead-letter handling. Suitable for MVP without Redis.
 */
export class JobQueue {
  private running = 0;
  private cancelled = new Set<string>();

  constructor(
    private readonly options: {
      concurrency?: number;
      domainDelayMs?: number;
    } = {},
  ) {}

  async enqueue(scanId: string, type: string, payload: unknown, scheduledFor = new Date()) {
    return prisma.scanJob.create({
      data: {
        scanId,
        type,
        status: "PENDING",
        payloadJson: JSON.stringify(payload),
        scheduledFor,
      },
    });
  }

  cancel(jobId: string) {
    this.cancelled.add(jobId);
  }

  async processDue(handlers: Record<string, JobHandler>) {
    const concurrency = this.options.concurrency ?? 2;
    const due = await prisma.scanJob.findMany({
      where: {
        status: "PENDING",
        deadLetter: false,
        scheduledFor: { lte: new Date() },
      },
      orderBy: { scheduledFor: "asc" },
      take: concurrency,
    });

    for (const job of due) {
      if (this.running >= concurrency) break;
      if (this.cancelled.has(job.id)) {
        await prisma.scanJob.update({
          where: { id: job.id },
          data: { status: "CANCELLED", finishedAt: new Date() },
        });
        continue;
      }
      this.running += 1;
      try {
        await this.runOne(job.id, handlers);
      } finally {
        this.running -= 1;
        if (this.options.domainDelayMs) {
          await new Promise((r) => setTimeout(r, this.options.domainDelayMs));
        }
      }
    }
  }

  private async runOne(jobId: string, handlers: Record<string, JobHandler>) {
    const job = await prisma.scanJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });
    const handler = handlers[job.type];
    if (!handler) {
      await prisma.scanJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          lastError: `No handler for ${job.type}`,
          deadLetter: true,
          finishedAt: new Date(),
        },
      });
      return;
    }
    try {
      const payload = job.payloadJson ? JSON.parse(job.payloadJson) : {};
      const result = await handler(payload);
      await prisma.scanJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          resultJson: JSON.stringify(result ?? {}),
          finishedAt: new Date(),
        },
      });
      logInfo("job_completed", { jobId, type: job.type });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const attempts = job.attempts;
      const maxAttempts = job.maxAttempts;
      if (attempts >= maxAttempts) {
        await prisma.scanJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            lastError: message,
            deadLetter: true,
            finishedAt: new Date(),
          },
        });
        logWarn("job_dead_letter", { jobId, message });
      } else {
        const backoffMs = Math.min(60_000, 1000 * 2 ** attempts);
        await prisma.scanJob.update({
          where: { id: jobId },
          data: {
            status: "PENDING",
            lastError: message,
            scheduledFor: new Date(Date.now() + backoffMs),
          },
        });
        logWarn("job_retry", { jobId, attempts, backoffMs });
      }
    }
  }
}

/** Simple cron interpreter for daily/weekly presets and 5-field cron. */
export function nextCronRun(cron: string, from = new Date()): Date {
  if (cron === "daily") {
    const d = new Date(from);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (cron === "weekly") {
    const d = new Date(from);
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  // Minimal: "0 9 * * *" → next 09:00
  const parts = cron.trim().split(/\s+/);
  if (parts.length >= 2) {
    const minute = Number(parts[0]) || 0;
    const hour = Number(parts[1]) || 9;
    const d = new Date(from);
    d.setSeconds(0, 0);
    d.setMinutes(minute);
    d.setHours(hour);
    if (d <= from) d.setDate(d.getDate() + 1);
    return d;
  }
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  return d;
}

export async function syncSchedules() {
  const schedules = await prisma.scheduleConfig.findMany({ where: { enabled: true } });
  const now = new Date();
  for (const s of schedules) {
    if (!s.nextRunAt || s.nextRunAt <= now) {
      await prisma.scheduleConfig.update({
        where: { id: s.id },
        data: {
          lastRunAt: now,
          nextRunAt: nextCronRun(s.cron, now),
        },
      });
      logInfo("schedule_due", { scheduleId: s.id, keyword: s.keyword });
      return s;
    }
  }
  return null;
}
