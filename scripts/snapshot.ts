/**
 * Run the daily sold-snapshot tracker outside Vercel (local machine, VPS cron, CI).
 *   npm run snapshot            # one pass (~50s budget)
 *   npm run snapshot -- --all   # keep going until every due listing is snapshotted
 */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { runTracker } from "@/lib/services/tracker";

async function main() {
  const all = process.argv.includes("--all");
  let pass = 0;
  for (;;) {
    pass += 1;
    const result = await runTracker({ deadline: Date.now() + 50_000 });
    console.log(`pass ${pass}:`, result);
    if (!all || result.remaining === 0 || result.snapshotted === 0) break;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
