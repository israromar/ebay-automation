import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Research Analyzer",
  description: "AliExpress sourcing vs eBay demand and profitability",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-6">{children}</main>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
