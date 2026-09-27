export function money(minor: number | null | undefined, opts?: { signed?: boolean }) {
  if (minor == null) return "—";
  const abs = Math.abs(minor) / 100;
  const s = abs.toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (minor < 0) return `−${s}`;
  return opts?.signed ? `+${s}` : s;
}

export function compact(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export function relativeTime(iso: string | Date | null | undefined) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export async function fetchJson<T>(url: string, init?: RequestInit & { silent?: boolean }): Promise<T> {
  const { silent, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(silent ? { "x-pulse-silent": "1" } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: unknown };
  if (!res.ok) {
    const message = typeof json.error === "string" ? json.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}
