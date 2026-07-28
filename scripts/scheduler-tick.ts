/**
 * Scheduler worker tick — process due schedules / jobs without Cursor.
 * Run via cron: npx tsx scripts/scheduler-tick.ts
 */
import { syncSchedules, JobQueue } from "../src/lib/jobs/queue";
import { logInfo } from "../src/lib/logger";

async function main() {
  const due = await syncSchedules();
  logInfo("scheduler_tick", { due: due?.id ?? null });
  const queue = new JobQueue({ concurrency: 2, domainDelayMs: 500 });
  await queue.processDue({
    // Wire FULL_RESEARCH etc. when using enqueued jobs from API
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
