"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const nav = [
  { href: "/", label: "Overview" },
  { href: "/automation", label: "Automation" },
  { href: "/research", label: "Research" },
  { href: "/candidates", label: "Candidates" },
  { href: "/scans", label: "Scans" },
  { href: "/settings", label: "Settings" },
  { href: "/schedules", label: "Schedules" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const isLogin = pathname?.startsWith("/login");

  useEffect(() => {
    if (isLogin) return;
    void fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { user?: { email?: string } };
        setEmail(json.user?.email ?? null);
      })
      .catch(() => undefined);
  }, [isLogin, pathname]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (isLogin) {
    return <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>;
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-teal-700">Marketplace research</p>
            <h1 className="text-lg font-semibold">Product Research Analyzer</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav className="flex flex-wrap gap-3 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100">
                  {item.label}
                </Link>
              ))}
            </nav>
            {email ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="hidden sm:inline">{email}</span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
