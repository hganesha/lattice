import { useMemo, useState } from "react";
import {
  Panel,
  Badge,
  Bar,
  Avatar,
  ChipButton,
  SectionLabel,
  TONES,
} from "@/components/primitives";
import { Scatter, Donut, Histogram } from "@/components/charts";
import {
  IconCrosshair,
  IconFlag,
  IconBeaker,
  IconSpark,
  IconArrowRight,
} from "@/components/icons";
import { outliers, outlierHeat, DIMENSION_LABELS, type OutlierRow } from "@/data/lattice";
import type { Env } from "@/data/lattice";

const sevTone: Record<OutlierRow["severity"], "rose" | "amber" | "neutral"> = {
  critical: "rose",
  high: "amber",
  medium: "neutral",
};

// deterministic "normal" context points clustering near the diagonal
const contextPoints = Array.from({ length: 46 }, (_, i) => {
  const exp = 58 + ((i * 53) % 41);
  const noise = (((i * 17 + 5) % 11) - 5) * 1.7;
  const actual = Math.max(38, Math.min(99, Math.round(exp + noise)));
  return { x: exp, y: actual, out: false as const };
});

export default function Outliers({ query, env }: { query: string; env: Env }) {
  void env;
  const [sev, setSev] = useState<"all" | OutlierRow["severity"]>("all");

  const scatterPoints = useMemo(
    () => [
      ...contextPoints,
      ...outliers.map((o) => ({ x: o.expected, y: o.actual, out: true, label: `${o.id} · ${o.dimension}` })),
    ],
    [],
  );

  const sevCounts = {
    critical: outliers.filter((o) => o.severity === "critical").length,
    high: outliers.filter((o) => o.severity === "high").length,
    medium: outliers.filter((o) => o.severity === "medium").length,
  };
  const sevMix = [
    { label: "Critical", value: sevCounts.critical, tone: "rose" as const },
    { label: "High", value: sevCounts.high, tone: "amber" as const },
    { label: "Medium", value: sevCounts.medium, tone: "neutral" as const },
  ];

  const dimCounts = outlierHeat
    .map((h) => ({ dim: h.dim, total: h.vals.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  const maxDim = Math.max(...dimCounts.map((d) => d.total));

  const deltas = outliers.map((o) => Math.max(0, o.expected - o.actual));
  const histBins = useMemo(() => {
    const bins = new Array(7).fill(0);
    deltas.forEach((d) => {
      const idx = Math.min(6, Math.floor(d / 9));
      bins[idx]++;
    });
    return bins;
  }, [deltas]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outliers
      .filter((o) => (sev === "all" ? true : o.severity === sev))
      .filter((o) => (q ? `${o.id} ${o.target} ${o.dimension} ${o.suggestion}`.toLowerCase().includes(q) : true))
      .sort((a, b) => (a.severity === "critical" ? -1 : b.severity === "critical" ? 1 : b.expected - b.actual - (a.expected - a.actual)));
  }, [sev, query]);

  const topDim = dimCounts[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Improvement Surface</SectionLabel>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">Outlier Analysis</h1>
          <p className="mt-1 text-sm text-muted">
            Identify evaluation outliers and the improvement opportunities they reveal — at scale.
          </p>
        </div>
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Outliers flagged", value: outliers.length, icon: <IconCrosshair size={15} />, tone: "amber" as const },
          { label: "Critical severity", value: sevCounts.critical, icon: <IconFlag size={15} />, tone: "rose" as const },
          { label: "Weak dimension", value: DIMENSION_LABELS[topDim.dim].split(" ")[0], icon: <IconBeaker size={15} />, tone: "brand" as const },
          { label: "Improvement ops", value: list.length, icon: <IconSpark size={15} />, tone: "emerald" as const },
        ].map((s) => (
          <Panel key={s.label} className="flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${TONES[s.tone]}1a`, color: TONES[s.tone] }}>
              {s.icon}
            </span>
            <div>
              <div className="text-lg font-semibold capitalize text-fg tnum">{s.value}</div>
              <div className="text-[11px] text-faint">{s.label}</div>
            </div>
          </Panel>
        ))}
      </div>

      {/* scatter + severity */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <SectionLabel>Distribution</SectionLabel>
              <h2 className="mt-1 text-sm font-semibold text-fg">Expected vs actual score</h2>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-brand/70" /> nominal</span>
              <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-rose" /> outlier</span>
            </div>
          </div>
          <Scatter points={scatterPoints} />
        </Panel>

        <Panel className="flex flex-col p-5">
          <SectionLabel>Severity Mix</SectionLabel>
          <h2 className="mt-1 text-sm font-semibold text-fg">Flagged outliers</h2>
          <div className="flex flex-1 items-center justify-center py-3">
            <Donut
              segments={sevMix}
              size={160}
              center={
                <>
                  <span className="mono text-2xl font-semibold text-fg tnum">{outliers.length}</span>
                  <span className="text-[10px] uppercase tracking-wider text-faint">total</span>
                </>
              }
            />
          </div>
          <div className="space-y-2">
            {sevMix.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONES[s.tone] }} />
                  {s.label}
                </span>
                <span className="mono font-semibold text-fg tnum">{s.value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* heatmap + histogram */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2">
          <div className="mb-4">
            <SectionLabel>Heatmap</SectionLabel>
            <h2 className="mt-1 text-sm font-semibold text-fg">Outliers by dimension · last 12h</h2>
          </div>
          <div className="space-y-1.5">
            {outlierHeat.map((row) => {
              const mx = Math.max(...row.vals);
              return (
                <div key={row.dim} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-[11px] text-muted">{DIMENSION_LABELS[row.dim]}</span>
                  <div className="flex flex-1 gap-1">
                    {row.vals.map((v, i) => (
                      <div
                        key={i}
                        className="h-6 flex-1 rounded"
                        title={`${v}`}
                        style={{
                          background: v === 0 ? "rgba(255,255,255,0.03)" : TONES.rose,
                          opacity: v === 0 ? 1 : 0.14 + (v / mx) * 0.86,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-faint">
            <span>low</span>
            {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
              <span key={o} className="h-3 w-5 rounded" style={{ background: TONES.rose, opacity: o }} />
            ))}
            <span>high</span>
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionLabel>Delta Distribution</SectionLabel>
          <h2 className="mt-1 text-sm font-semibold text-fg">Score gap (exp − actual)</h2>
          <div className="mt-5">
            <Histogram data={histBins} tone="rose" height={120} />
            <div className="mt-1 flex justify-between text-[10px] text-faint">
              <span>0</span><span>20</span><span>40+</span>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 text-[11px] text-faint">Weakest dimensions</div>
            <div className="space-y-2">
              {dimCounts.slice(0, 3).map((d) => (
                <div key={d.dim}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="text-muted">{DIMENSION_LABELS[d.dim]}</span>
                    <span className="mono text-fg tnum">{d.total}</span>
                  </div>
                  <Bar value={(d.total / maxDim) * 100} tone="amber" height={5} />
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* improvement opportunities */}
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5 pb-3">
          <div>
            <SectionLabel>Improvement Opportunities</SectionLabel>
            <h2 className="mt-1 text-sm font-semibold text-fg">Prioritized remediation</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <ChipButton active={sev === "all"} onClick={() => setSev("all")}>All</ChipButton>
            {(["critical", "high", "medium"] as OutlierRow["severity"][]).map((s) => (
              <ChipButton key={s} active={sev === s} onClick={() => setSev(s)}>
                <span className="capitalize">{s}</span>
              </ChipButton>
            ))}
          </div>
        </div>
        <div className="divide-y divide-line/60">
          {list.map((o) => {
            const tone = sevTone[o.severity];
            return (
              <div key={o.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02] md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar label={o.target} tone="brand" size={34} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="mono text-[11px] text-faint">{o.id}</span>
                      <Badge tone={tone} size="sm">{o.severity}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-fg">
                      <span className="capitalize text-muted">{o.dimension}</span> gap on{" "}
                      <span className="mono">{o.target}</span>
                    </div>
                  </div>
                </div>

                {/* expected → actual */}
                <div className="flex w-full items-center gap-3 md:w-64">
                  <div className="relative flex-1">
                    <Bar value={o.actual} tone={tone} height={7} />
                    <div className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-fg/70" style={{ left: `${o.expected}%` }} title={`expected ${o.expected}`} />
                  </div>
                  <span className="mono whitespace-nowrap text-[11px] text-muted tnum">
                    {o.expected}<IconArrowRight size={9} className="mx-0.5 inline text-dim" />
                    <span style={{ color: TONES[tone] }}>{o.actual}</span>
                  </span>
                </div>

                {/* suggestion */}
                <div className="flex items-start gap-2 md:w-72">
                  <IconSpark size={13} className="mt-0.5 shrink-0 text-emerald" />
                  <p className="text-[12px] leading-snug text-muted">{o.suggestion}</p>
                </div>
              </div>
            );
          })}
          {list.length === 0 && (
            <div className="py-12 text-center text-sm text-faint">No outliers at this severity.</div>
          )}
        </div>
      </Panel>
    </div>
  );
}
