import { mkdir, appendFile, readFile, writeFile } from "fs/promises";
import path from "path";
import type { SpreadsheetExporter } from "@/lib/providers/types";
import { EXPORT_HEADERS, type ExportCandidateRow, type ExportResult } from "./types";

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export class CsvExporter implements SpreadsheetExporter {
  readonly name = "CsvExporter";

  constructor(private readonly filePath: string) {}

  async exportCandidates(candidates: ExportCandidateRow[]): Promise<ExportResult> {
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      let existing = "";
      try {
        existing = await readFile(this.filePath, "utf8");
      } catch {
        existing = "";
      }
      const existingFingerprints = new Set(
        existing
          .split("\n")
          .slice(1)
          .map((line) => line.split(",").pop()?.replace(/"/g, "") ?? ""),
      );
      const fresh = candidates.filter((c) => !existingFingerprints.has(c.fingerprint));
      if (!existing) {
        await writeFile(this.filePath, EXPORT_HEADERS.join(",") + "\n", "utf8");
      }
      const lines = fresh.map((row) =>
        EXPORT_HEADERS.map((h) => escapeCsv(String(row[h] ?? ""))).join(","),
      );
      if (lines.length) {
        await appendFile(this.filePath, lines.join("\n") + "\n", "utf8");
      }
      return {
        success: true,
        destination: this.filePath,
        exportedCount: fresh.length,
        rowRange: `append:${fresh.length}`,
      };
    } catch (e) {
      return {
        success: false,
        destination: this.filePath,
        exportedCount: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
