"use client";

import { useMemo, useRef, useState } from "react";

export interface SnapshotPoint {
  lifetimeSold: number;
  capturedAt: string;
}

const W = 640;
const H = 200;
const PAD = { top: 16, right: 56, bottom: 26, left: 44 };

function niceTicks(min: number, max: number, count = 3): number[] {
  if (max === min) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v));
  return ticks;
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Lifetime units sold per daily snapshot — the slope is the sales rate. Single series, so no legend. */
export function SoldChart({ snapshots }: { snapshots: SnapshotPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const points = useMemo(
    () => snapshots.map((s) => ({ t: new Date(s.capturedAt).getTime(), v: s.lifetimeSold, at: s.capturedAt })),
    [snapshots],
  );

  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No snapshots yet. The daily tracker records the first one on its next run.</p>;
  }

  const tMin = points[0]!.t;
  const tMax = points[points.length - 1]!.t;
  const vMinRaw = Math.min(...points.map((p) => p.v));
  const vMaxRaw = Math.max(...points.map((p) => p.v));
  const ticks = niceTicks(vMinRaw, vMaxRaw === vMinRaw ? vMinRaw + 10 : vMaxRaw);
  const vMin = Math.min(ticks[0]!, vMinRaw);
  const vMax = Math.max(ticks[ticks.length - 1]!, vMaxRaw, vMin + 1);
  const x = (t: number) =>
    tMax === tMin ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((t - tMin) / (tMax - tMin)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - vMin) / (vMax - vMin)) * (H - PAD.top - PAD.bottom);

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(tMax).toFixed(1)},${y(vMin)} L${x(tMin).toFixed(1)},${y(vMin)} Z`;
  const last = points[points.length - 1]!;
  const active = hover != null ? points[hover]! : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i]!.t) - px) < Math.abs(x(points[best]!.t) - px)) best = i;
    setHover(best);
  }

  const xLabels = points.length > 1 ? [points[0]!, points[points.length - 1]!] : [points[0]!];

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Lifetime units sold, ${points.length} daily snapshots, latest ${last.v}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--sidebar-border)" strokeWidth={1} />
              <text
                x={PAD.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {tick.toLocaleString()}
              </text>
            </g>
          ))}
          {xLabels.map((p, i) => (
            <text
              key={p.at}
              x={x(p.t)}
              y={H - 6}
              textAnchor={xLabels.length === 1 ? "middle" : i === 0 ? "start" : "end"}
              className="fill-muted-foreground text-[11px]"
            >
              {dateFmt.format(p.t)}
            </text>
          ))}
          {points.length > 1 ? <path d={area} fill="var(--chart-1)" opacity={0.1} /> : null}
          {points.length > 1 ? (
            <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          {active ? (
            <line
              x1={x(active.t)}
              x2={x(active.t)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              opacity={0.4}
            />
          ) : null}
          {(active ? [active] : [last]).map((p) => (
            <circle key={p.at} cx={x(p.t)} cy={y(p.v)} r={4.5} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
          ))}
          <text
            x={x(last.t) + 10}
            y={y(last.v)}
            dominantBaseline="middle"
            className="fill-foreground text-[12px] font-semibold tabular-nums"
          >
            {last.v.toLocaleString()}
          </text>
        </svg>
        {active ? (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm"
            style={{ left: `${(x(active.t) / W) * 100}%`, transform: `translateX(${x(active.t) > W / 2 ? "-105%" : "5%"})` }}
          >
            <p className="text-muted-foreground">
              {new Date(active.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <p className="font-semibold tabular-nums">{active.v.toLocaleString()} sold lifetime</p>
            {hover != null && hover > 0 ? (
              <p className="tabular-nums text-muted-foreground">
                +{Math.max(0, active.v - points[hover - 1]!.v).toLocaleString()} since previous
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowTable((s) => !s)}>
        {showTable ? "Hide" : "Show"} snapshot table
      </button>
      {showTable ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Captured</th>
              <th className="py-1 text-right font-medium">Lifetime sold</th>
              <th className="py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {points.map((p, i) => (
              <tr key={p.at} className="border-t border-border">
                <td className="py-1">{new Date(p.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="py-1 text-right">{p.v.toLocaleString()}</td>
                <td className="py-1 text-right text-muted-foreground">
                  {i === 0 ? "—" : `${p.v - points[i - 1]!.v >= 0 ? "+" : ""}${(p.v - points[i - 1]!.v).toLocaleString()}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
