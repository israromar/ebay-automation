import { NextResponse } from "next/server";
import { z } from "zod";
import { isNextResponse, requireSessionWorkspace } from "@/lib/auth/session";
import { parseTerapeakText } from "@/lib/domain/terapeak-import";
import { createHunt } from "@/lib/services/hunt";
import { serializeHunt } from "./hunt-serialize";

const MAX_ROWS = 500;

const schema = z.object({
  text: z.string().max(2_000_000),
  rangeDays: z.number().int().min(1).max(365).default(30),
  label: z.string().max(120).optional(),
  /** true = parse only and return the preview. */
  preview: z.boolean().default(false),
});

export async function POST(req: Request) {
  const session = await requireSessionWorkspace();
  if (isNextResponse(session)) return session;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const result = parseTerapeakText(parsed.data.text, { rangeDays: parsed.data.rangeDays });
  if (result.rows.length > MAX_ROWS) {
    result.errors.push({ line: 0, message: `Only the first ${MAX_ROWS} rows are imported` });
    result.rows = result.rows.slice(0, MAX_ROWS);
  }
  if (parsed.data.preview) return NextResponse.json(result);
  if (result.rows.length === 0) {
    return NextResponse.json({ ...result, error: result.errors[0]?.message ?? "No valid rows" }, { status: 400 });
  }

  const hunt = await createHunt(session.workspace.id, {
    kind: "TERAPEAK",
    rows: result.rows,
    label: parsed.data.label?.trim() || `Terapeak import · ${result.rows.length} rows`,
  });
  return NextResponse.json({ ...result, hunt: serializeHunt(hunt) }, { status: 201 });
}
