import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthDisabled, isEmailAllowed } from "@/lib/auth/allowlist";
import { createClient } from "@/lib/auth/supabase-server";
import { ensureDefaultWorkspace } from "@/lib/services/providers";

export type SessionWorkspace = {
  user: { id: string; email: string; name: string | null; supabaseUserId: string | null };
  workspace: { id: string; name: string; userId: string };
};

/**
 * Resolve the signed-in user's personal workspace (create on first login).
 * When AUTH_DISABLED, falls back to the legacy default workspace for workers/tests.
 */
export async function requireSessionWorkspace(): Promise<SessionWorkspace | NextResponse> {
  if (isAuthDisabled()) {
    const workspace = await ensureDefaultWorkspace();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: workspace.userId } });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        supabaseUserId: user.supabaseUserId,
      },
      workspace: { id: workspace.id, name: workspace.name, userId: workspace.userId },
    };
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEmailAllowed(authUser.email)) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Email not allowlisted" }, { status: 403 });
  }

  try {
    const session = await ensureUserWorkspace({
      supabaseUserId: authUser.id,
      email: authUser.email,
      name: authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null,
    });
    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Workspace bootstrap failed: ${message}` }, { status: 500 });
  }
}

export async function ensureUserWorkspace(input: {
  supabaseUserId: string;
  email: string;
  name?: string | null;
}): Promise<SessionWorkspace> {
  const email = input.email.trim().toLowerCase();
  let user = await prisma.user.findFirst({
    where: {
      OR: [{ supabaseUserId: input.supabaseUserId }, { email }],
    },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: input.name ?? email.split("@")[0] ?? "Operator",
        supabaseUserId: input.supabaseUserId,
      },
    });
  } else if (!user.supabaseUserId || user.email !== email) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        supabaseUserId: input.supabaseUserId,
        email,
        ...(input.name ? { name: input.name } : {}),
      },
    });
  }

  let workspace = await prisma.workspace.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: `${user.name ?? "Personal"} Workspace`,
        userId: user.id,
        settings: { create: {} },
      },
    });
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      supabaseUserId: user.supabaseUserId,
    },
    workspace: { id: workspace.id, name: workspace.name, userId: workspace.userId },
  };
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
