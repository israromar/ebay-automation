export function parseAllowedEmails(raw = process.env.ALLOWED_EMAILS): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = parseAllowedEmails();
  // Empty allowlist = deny everyone when auth is enabled (fail closed).
  if (allowed.size === 0) return false;
  return allowed.has(email.trim().toLowerCase());
}

/** When true, APIs/UI skip Supabase session (local scripts, tests, worker). */
export function isAuthDisabled(): boolean {
  return process.env.AUTH_DISABLED === "true" || process.env.NODE_ENV === "test";
}
