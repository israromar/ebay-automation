function escapeCsv(value: string): string {
  // Neutralise spreadsheet formula injection from marketplace titles.
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(","), ...rows.map((row) => headers.map((h) => escapeCsv(String(row[h] ?? ""))).join(","))];
  return lines.join("\n") + "\n";
}
