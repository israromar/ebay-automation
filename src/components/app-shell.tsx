"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Search,
  Package,
  Radar,
  CalendarClock,
  Settings,
  LogOut,
  Bell,
  HelpCircle,
  PanelLeftClose,
  PanelLeft,
  Gauge,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlobalLoaderProvider } from "@/components/global-loader";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "pulse-sidebar-collapsed";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/automation", label: "Automation", icon: Bot },
  { href: "/research", label: "Research", icon: Search },
  { href: "/analyzer", label: "Analyzer", icon: Gauge },
  { href: "/candidates", label: "Candidates", icon: Package },
  { href: "/scans", label: "Scans", icon: Radar },
  { href: "/schedules", label: "Schedules", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const isLogin = pathname?.startsWith("/login");

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;
    void fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          user?: { email?: string };
          workspace?: { name?: string };
        };
        setEmail(json.user?.email ?? null);
        setWorkspace(json.workspace?.name ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isLogin]);

  const initials = useMemo(() => {
    if (!email) return "?";
    const local = email.split("@")[0] ?? "?";
    return local.slice(0, 2).toUpperCase();
  }, [email]);

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/research?seed=${encodeURIComponent(q)}`);
  }

  if (isLogin) {
    return (
      <GlobalLoaderProvider>
        <div className="min-h-screen bg-background">{children}</div>
      </GlobalLoaderProvider>
    );
  }

  return (
    <GlobalLoaderProvider>
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-card",
          "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]",
          collapsed ? "w-[72px]" : "w-[248px]",
        )}
      >
        <div className={cn("flex items-start gap-2 py-4", collapsed ? "justify-center px-2" : "px-4")}>
          <div className={cn("min-w-0 flex-1 overflow-hidden", collapsed && "hidden")}>
            <p className="truncate text-[15px] font-bold tracking-tight text-primary">Pulse Analytics</p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
              {workspace ?? "Personal workspace"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>

        <nav className={cn("flex flex-1 flex-col gap-0.5", collapsed ? "px-2" : "px-3")}>
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "relative flex items-center rounded-lg text-sm transition-[colors,padding,gap] duration-300",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2.5",
                  active
                    ? "bg-[#e8efff] font-semibold text-primary"
                    : "text-foreground/75 hover:bg-muted hover:text-foreground",
                )}
              >
                {active ? (
                  <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-primary" />
                ) : null}
                <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "opacity-70")} />
                <span
                  className={cn(
                    "truncate transition-[opacity,max-width] duration-200 ease-out",
                    collapsed ? "max-w-0 opacity-0" : "max-w-[160px] opacity-100",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className={cn("mt-auto space-y-3 border-t border-sidebar-border", collapsed ? "p-2" : "p-4")}>
          <div
            className={cn(
              "overflow-hidden rounded-xl transition-[max-height,opacity] duration-300 ease-out",
              collapsed ? "max-h-0 opacity-0" : "max-h-40 opacity-100",
            )}
          >
            <Image
              src="/media/product-packaging.jpg"
              alt=""
              width={400}
              height={160}
              className="h-20 w-full object-cover"
            />
            <div className="bg-muted/70 px-3 py-2">
              <p className="text-[11px] font-medium text-foreground">Sourcing desk</p>
              <p className="text-[10px] text-muted-foreground">Shared eBay + AE keys · invite only</p>
            </div>
          </div>
          {email ? (
            <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-2")}>
              <Avatar className="size-8 shrink-0" title={email}>
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="truncate text-xs font-medium">{email}</p>
                    <button
                      type="button"
                      onClick={signOut}
                      className="text-[11px] text-muted-foreground hover:text-primary"
                    >
                      Sign out
                    </button>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={signOut} title="Sign out">
                    <LogOut className="size-3.5" />
                  </Button>
                </>
              ) : (
                <Button type="button" variant="ghost" size="icon-sm" onClick={signOut} title="Sign out">
                  <LogOut className="size-3.5" />
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-card/95 px-5 backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 md:hidden"
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
          <form onSubmit={onSearch} className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search keywords, eBay URL, or niche…"
              className="h-9 pl-8"
            />
          </form>
          <div className="ml-auto hidden items-center gap-4 text-sm md:flex">
            <button type="button" className="text-primary underline-offset-2 hover:underline">
              Marketplace: eBay US
            </button>
            <span className="text-muted-foreground">Currency: USD</span>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" title="Notifications">
              <span className="relative">
                <Bell className="size-4" />
                <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive" />
              </span>
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" title="Help">
              <HelpCircle className="size-4" />
            </Button>
            <Avatar className="ml-1 size-8">
              <AvatarFallback className="bg-[#004ac6] text-[11px] font-semibold text-white">{initials}</AvatarFallback>
            </Avatar>
          </div>
        </header>
        <main className="flex-1 px-5 py-6 lg:px-7">{children}</main>
      </div>
    </div>
    </GlobalLoaderProvider>
  );
}
