import { NextResponse } from "next/server";
import { runTracker } from "@/lib/services/tracker";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runTracker({ deadline: Date.now() + 50_000 });
  return NextResponse.json(result);
}
