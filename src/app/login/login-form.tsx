"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/auth/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, LineChart, ShieldCheck, Sparkles } from "lucide-react";

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
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Visual panel — Stitch-inspired auth hero */}
      <section className="relative hidden overflow-hidden bg-[#0b1f4d] lg:block">
        <Image
          src="/media/auth-hero.jpg"
          alt="Retail operations desk with packaging and devices"
          fill
          priority
          className="object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#041233] via-[#0b1f4d]/75 to-[#2563eb]/35" />
        <div className="relative z-10 flex h-full flex-col justify-between p-10 text-white">
          <div>
            <p className="text-sm font-semibold tracking-wide text-blue-200">Pulse Analytics</p>
            <h1 className="mt-6 max-w-md text-4xl leading-tight font-semibold tracking-tight">
              Find eBay demand.
              <br />
              Match AliExpress supply.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-blue-100/90">
              Invite-only research desk for high-margin sourcing — Browse clusters, visual AE matches, and approval before
              export.
            </p>
          </div>

          <div className="grid max-w-lg gap-3">
            {[
              { icon: LineChart, title: "Trend research", body: "Active-listing proxies + life-est sold signals" },
              { icon: Sparkles, title: "Visual matching", body: "DINOv2 scoring when AE candidates look right" },
              { icon: ShieldCheck, title: "Human gates", body: "Demand proof + approve before anything ships" },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
                <item.icon className="mt-0.5 size-5 shrink-0 text-blue-200" />
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-blue-100/80">{item.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="relative mt-8 h-36 overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
            <Image src="/media/auth-shelf.jpg" alt="Retail product shelves" fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#041233]/80 to-transparent" />
            <p className="absolute bottom-3 left-4 text-xs font-medium text-blue-50">Built for operators, not public self-serve</p>
          </div>
        </div>
      </section>

      {/* Form panel */}
      <section className="relative flex items-center justify-center bg-background px-6 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#dbe1ff_0%,_transparent_50%)]"
        />
        <div className="relative w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-bold text-primary">Pulse Analytics</p>
            <p className="mt-1 text-sm text-muted-foreground">Invite-only product research</p>
          </div>

          <Badge variant="secondary" className="mb-3 font-normal">
            Allowlisted access
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight">{mode === "signin" ? "Welcome back" : "Create your seat"}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in with the email on <span className="font-mono text-xs">ALLOWED_EMAILS</span>. Shared platform keys power
            research for your workspace.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10"
              />
            </div>
            <Button type="submit" disabled={busy} className="h-10 w-full text-sm">
              {busy ? "Working…" : mode === "signin" ? "Sign in to workspace" : "Create account"}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-primary"
              onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            >
              {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
            </button>
            {message ? (
              <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground/90">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                {message}
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  );
}
