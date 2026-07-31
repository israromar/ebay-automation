"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/auth/supabase-browser";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => {
    const err = searchParams.get("error");
    if (err === "not_allowed") return "That email is not on the invite allowlist.";
    if (err === "auth_not_configured") return "Auth is not configured (missing Supabase anon key).";
    return "";
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Account created. If email confirmation is enabled, check your inbox; otherwise sign in.");
        setMode("signin");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const next = searchParams.get("next") || "/";
      router.replace(next);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
      <p className="mt-2 text-sm text-slate-600">Invite-only access. Use the email on the allowlist.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          className="w-full text-sm text-slate-600 hover:text-teal-800"
          onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        {message ? <p className="text-sm text-amber-800">{message}</p> : null}
      </form>
    </div>
  );
}
