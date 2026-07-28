import type { SpreadsheetExporter } from "@/lib/providers/types";
import { EXPORT_HEADERS, type ExportCandidateRow, type ExportResult } from "./types";

/**
 * Production Google Sheets exporter via official API.
 * Requires GOOGLE_SERVICE_ACCOUNT_JSON (path or inline) and spreadsheet ID.
 */
export class GoogleSheetsApiExporter implements SpreadsheetExporter {
  readonly name = "GoogleSheetsApiExporter";

  constructor(
    private readonly config: {
      spreadsheetId: string;
      sheetName?: string;
      credentialsJson?: string;
    },
  ) {}

  async exportCandidates(candidates: ExportCandidateRow[]): Promise<ExportResult> {
    if (!this.config.spreadsheetId) {
      return {
        success: false,
        destination: "google_sheets",
        exportedCount: 0,
        error: "Missing spreadsheetId",
      };
    }
    if (!this.config.credentialsJson && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return {
        success: false,
        destination: "google_sheets",
        exportedCount: 0,
        error:
          "Google credentials not configured — use CsvExporter for local PoC or set GOOGLE_SERVICE_ACCOUNT_JSON",
      };
    }

    try {
      const { google } = await import("googleapis");
      const credRaw =
        this.config.credentialsJson ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "";
      const credentials = JSON.parse(credRaw);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });
      const sheetName = this.config.sheetName ?? "Approved";

      const meta = await sheets.spreadsheets.values.get({
        spreadsheetId: this.config.spreadsheetId,
        range: `${sheetName}!A1:AD1`,
      });
      if (!meta.data.values?.length) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: this.config.spreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: "RAW",
          requestBody: { values: [EXPORT_HEADERS] },
        });
      }

      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: this.config.spreadsheetId,
        range: `${sheetName}!AD:AD`,
      });
      const fingerprints = new Set((existing.data.values ?? []).flat());
      const fresh = candidates.filter((c) => !fingerprints.has(c.fingerprint));
      if (!fresh.length) {
        return {
          success: true,
          destination: "google_sheets",
          spreadsheetId: this.config.spreadsheetId,
          exportedCount: 0,
          rowRange: "none",
        };
      }

      const values = fresh.map((row) => EXPORT_HEADERS.map((h) => String(row[h] ?? "")));
      const append = await sheets.spreadsheets.values.append({
        spreadsheetId: this.config.spreadsheetId,
        range: `${sheetName}!A:AD`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      });

      return {
        success: true,
        destination: "google_sheets",
        spreadsheetId: this.config.spreadsheetId,
        exportedCount: fresh.length,
        rowRange: append.data.updates?.updatedRange ?? undefined,
      };
    } catch (e) {
      return {
        success: false,
        destination: "google_sheets",
        spreadsheetId: this.config.spreadsheetId,
        exportedCount: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
