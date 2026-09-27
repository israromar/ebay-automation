"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function Thumb({ src, className }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element -- marketplace CDNs vary; no optimisation needed for thumbnails
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("size-12 shrink-0 rounded-md border border-border object-cover", className)}
    />
  ) : (
    <div className={cn("size-12 shrink-0 rounded-md border border-dashed border-border bg-muted", className)} />
  );
}
