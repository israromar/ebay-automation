import { z } from "zod";
import { extractEbayItemId } from "./ebay-ids";

/**
 * Parse rows copied or exported from eBay Seller Hub → Research → Product research (Terapeak),
 * "Sold" tab. Accepts CSV or tab-separated text (a direct copy of the table).
 */

export interface TerapeakRow {
  line: number;
  title: string;
  itemId: string | null;
  url: string | null;
  totalSold: number;
  /** totalSold scaled to a 30-day window. */
  sold30d: number;
  avgSoldPriceMinor: number | null;
}

export interface TerapeakRowError {
  line: number;
  message: string;
}

export interface TerapeakParseResult {
  rows: TerapeakRow[];
  errors: TerapeakRowError[];
  columns: Partial<Record<TerapeakField, string>>;
}

type TerapeakField = "title" | "itemId" | "url" | "totalSold" | "avgSoldPrice";

const HEADER_ALIASES: Record<TerapeakField, RegExp[]> = {
  itemId: [/^item ?id$/, /^item ?number$/, /^listing ?id$/],
  url: [/url/, /^link$/, /listing link/],
  title: [/^listing$/, /title/, /^item$/, /^product$/, /^listing name$/],
  totalSold: [/^total sold$/, /^sold$/, /^units sold$/, /^quantity sold$/, /^total units sold$/, /^qty sold$/],
  avgSoldPrice: [/^avg\.? sold price$/, /^average sold price$/, /^avg\.? price$/, /^sold price$/, /^average price$/],
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[ _]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectDelimiter(headerLine: string): "\t" | "," | ";" {
  if (headerLine.includes("\t")) return "\t";
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/** Minimal RFC 4180 parser (quoted fields, escaped quotes, CRLF). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.length === 0) {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** "$1,234.56", "US $12.00", "12" → minor units. */
export function parseMoneyToMinor(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned.replace(/,/g, "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function parseCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s]/g, "").match(/^\d+/)?.[0];
  return cleaned ? Number(cleaned) : null;
}

function mapColumns(header: string[]): Partial<Record<TerapeakField, number>> {
  const mapped: Partial<Record<TerapeakField, number>> = {};
  const normalized = header.map(normalizeHeader);
  for (const field of Object.keys(HEADER_ALIASES) as TerapeakField[]) {
    const idx = normalized.findIndex((h, i) => !Object.values(mapped).includes(i) && HEADER_ALIASES[field].some((re) => re.test(h)));
    if (idx >= 0) mapped[field] = idx;
  }
  return mapped;
}

const rowSchema = z.object({
  title: z.string().trim().min(3, "Missing title"),
  totalSold: z.number().int().min(0),
});

export function parseTerapeakText(text: string, options?: { rangeDays?: number }): TerapeakParseResult {
  const rangeDays = options?.rangeDays && options.rangeDays > 0 ? options.rangeDays : 30;
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return { rows: [], errors: [{ line: 0, message: "Nothing to import" }], columns: {} };

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  const table = parseDelimited(trimmed, detectDelimiter(firstLine));
  const header = table[0] ?? [];
  const cols = mapColumns(header);
  const columns = Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, header[i as number]?.trim() ?? ""])) as TerapeakParseResult["columns"];

  const errors: TerapeakRowError[] = [];
  if (cols.totalSold == null) {
    errors.push({ line: 1, message: 'Header row must include a "Total sold" column' });
  }
  if (cols.title == null && cols.itemId == null && cols.url == null) {
    errors.push({ line: 1, message: 'Header row must include "Listing"/"Title", "Item ID", or a URL column' });
  }
  if (errors.length) return { rows: [], errors, columns };

  const rows: TerapeakRow[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const cell = (field: TerapeakField) => (cols[field] == null ? undefined : cells[cols[field]!]?.trim());
    const url = cell("url") || null;
    const itemId = extractEbayItemId(cell("itemId") ?? "") ?? (url ? extractEbayItemId(url) : null);
    const title = cell("title") || (itemId ? `eBay item ${itemId}` : "");
    const totalSold = parseCount(cell("totalSold"));

    const parsed = rowSchema.safeParse({ title, totalSold: totalSold ?? -1 });
    if (!parsed.success) {
      errors.push({
        line,
        message: totalSold == null ? "Missing or invalid Total sold" : (parsed.error.issues[0]?.message ?? "Invalid row"),
      });
      return;
    }
    const key = itemId ?? title.toLowerCase();
    if (seen.has(key)) {
      errors.push({ line, message: "Duplicate row skipped" });
      return;
    }
    seen.add(key);
    rows.push({
      line,
      title: parsed.data.title,
      itemId,
      url,
      totalSold: parsed.data.totalSold,
      sold30d: Math.round((parsed.data.totalSold * 30) / rangeDays),
      avgSoldPriceMinor: parseMoneyToMinor(cell("avgSoldPrice")),
    });
  });

  return { rows, errors, columns };
}
