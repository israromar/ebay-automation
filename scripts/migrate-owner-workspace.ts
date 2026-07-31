/**
 * One-time: attach orphan SearchProjects / TrendResearchRuns / AutomationRuns
 * to the owner workspace (first User by createdAt, or OWNER_EMAIL).
 *
 * Usage:
 *   OWNER_EMAIL=you@example.com npx tsx scripts/migrate-owner-workspace.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-owner-workspace.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resolveOwnerWorkspace() {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  let user = ownerEmail
    ? await prisma.user.findUnique({ where: { email: ownerEmail } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user && ownerEmail) {
    user = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: ownerEmail.split("@")[0] ?? "Owner",
      },
    });
    console.log(`Created owner user ${user.email}`);
  }
  if (!user) {
    throw new Error("No users in DB. Set OWNER_EMAIL to create one, or seed a user first.");
  }

  let workspace = await prisma.workspace.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: `${user.name ?? "Owner"} Workspace`,
        userId: user.id,
        settings: { create: {} },
      },
    });
    console.log(`Created workspace ${workspace.id}`);
  }

  return { user, workspace };
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  const { user, workspace } = await resolveOwnerWorkspace();
  console.log(`Owner: ${user.email} → workspace ${workspace.id}${dryRun ? " (dry run)" : ""}`);

  const orphanProjects = await prisma.searchProject.findMany({
    where: { NOT: { workspaceId: workspace.id } },
    select: { id: true, workspaceId: true, name: true },
  });

  // Prefer reassigning projects that belong to other/default workspaces only when
  // explicitly migrating everything into the owner workspace (single-operator → two-user).
  const otherWorkspaceIds = [
    ...new Set(orphanProjects.map((p) => p.workspaceId).filter((id) => id !== workspace.id)),
  ];

  const nullTrendRuns = await prisma.trendResearchRun.count({ where: { workspaceId: null } });
  const nullAutomationRuns = await prisma.automationRun.count({ where: { workspaceId: null } });

  const foreignTrendRuns = await prisma.trendResearchRun.count({
    where: { workspaceId: { not: workspace.id } },
  });
  const foreignAutomationRuns = await prisma.automationRun.count({
    where: { workspaceId: { not: workspace.id } },
  });

  console.log({
    projectsOnOtherWorkspaces: orphanProjects.length,
    otherWorkspaceIds,
    trendRunsWithNullWorkspace: nullTrendRuns,
    automationRunsWithNullWorkspace: nullAutomationRuns,
    trendRunsNotOnOwner: foreignTrendRuns,
    automationRunsNotOnOwner: foreignAutomationRuns,
  });

  if (dryRun) {
    console.log("Dry run complete — no writes.");
    return;
  }

  if (orphanProjects.length > 0) {
    const result = await prisma.searchProject.updateMany({
      where: { id: { in: orphanProjects.map((p) => p.id) } },
      data: { workspaceId: workspace.id },
    });
    console.log(`Reassigned ${result.count} search project(s) to owner workspace`);
  }

  const trendMoved = await prisma.trendResearchRun.updateMany({
    where: { OR: [{ workspaceId: null }, { workspaceId: { not: workspace.id } }] },
    data: { workspaceId: workspace.id },
  });
  console.log(`Trend runs moved to owner: ${trendMoved.count}`);

  const autoMoved = await prisma.automationRun.updateMany({
    where: { OR: [{ workspaceId: null }, { workspaceId: { not: workspace.id } }] },
    data: { workspaceId: workspace.id },
  });
  console.log(`Automation runs moved to owner: ${autoMoved.count}`);

  console.log("Done. Existing candidates/scans follow via SearchProject.workspaceId.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
