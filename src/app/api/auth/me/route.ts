import { NextResponse } from "next/server";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";

export async function GET() {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  return NextResponse.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    workspace: {
      id: session.workspace.id,
      name: session.workspace.name,
    },
  });
}
