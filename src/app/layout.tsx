import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Research Analyzer",
  description: "AliExpress sourcing vs eBay demand and profitability",
};

const nav = [
  { href: "/", label: "Overview" },
  { href: "/automation", label: "Automation" },
  { href: "/research", label: "Research" },
  { href: "/candidates", label: "Candidates" },
  { href: "/scans", label: "Scans" },
  { href: "/settings", label: "Settings" },
  { href: "/schedules", label: "Schedules" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-teal-700">Marketplace research</p>
              <h1 className="text-lg font-semibold">Product Research Analyzer</h1>
            </div>
            <nav className="flex flex-wrap gap-3 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
