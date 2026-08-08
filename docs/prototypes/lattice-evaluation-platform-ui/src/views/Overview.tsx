import { useState } from "react";
import {
  Panel,
  Badge,
  Bar,
  Avatar,
  DeltaTag,
  SectionLabel,
  Dot,
  fmtPct,
  fmtCompact,
  fmtNum,
  TONES,
} from "@/components/primitives";
import { AreaTrend, RadialGauge, Donut, RadarChart, Sparkline } from "@/components/charts";
import { LatticeField } from "@/components/LatticeField";
import {
  IconArrowRight,
  IconBolt,
  IconFingerprint,
  IconNode,
  IconLink,
  IconShield,
  IconBeaker,
  IconChevronRight,
  IconCrosshair,
} from "@/components/icons";
import {
  kpis,
  trendSeries,
  dispositionMix,
  pipelineStages,
  humanVsAgent,
  runs,
  DIMENSION_LABELS,
} from "@/data/lattice";
import type { ViewKey } from "@/components/Sidebar";
import type { Env } from "@/data/lattice";

const stageIcon: Record<string, typeof IconBolt> = {
  intent: IconBolt,
  identity: IconFingerprint,
  delegation: IconNode,
  evidence: IconLink,
  disposition: IconShield,
};

function StatTile({
  label,
  value,
  delta,
  invert,
  icon,
  tone = "brand",
  spark,
  suffix,
}: {
  label: string;
  value: string;
  delta?: number;
  invert?: boolean;
  icon: React.ReactNode;
  tone?: keyof typeof TONES;
  spark?: number[];
  suffix?: string;
}) {
  return (
    <Panel hover className="p-4">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-faint">{label}</span>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `${TONES[tone]}1a`, color: TONES[tone] }}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-semibold tracking-tight text-fg tnum">{value}</span>
        {suffix && <span className="mb-0.5 text-xs text-faint">{suffix}</span>}
        {delta !== undefined && <span className="mb-1"><DeltaTag value={delta} invert={invert} /></span>}
      </div>
      {spark && (
        <div className="mt-1.5">
          <Sparkline data={spark} tone={tone} width={150} height={26} />
        </div>
      )}
    </Panel>
  );
}

export default function Overview({ onNavigate }: { query: string; env: Env; onNavigate: (v: ViewKey | "neweval") => void }) {
  const [metric, setMetric] = useState<"pass" | "vol" | "disp">("pass");
  const points = trendSeries.map((t) => ({
    label: t.d,
    value: metric === "pass" ? t.pass : metric === "vol" ? t.vol : t.disp,
  }));
  const fmtY = metric === "pass" ? (v: number) => `${(v * 100).toFixed(1)}%` : (v: number) => fmtCompact(v);
  const fmtTip = metric === "pass" ? (v: number) => `${(v * 100).toFixed(2)}%` : (v: number) => fmtNum(Math.round(v));

  const recent = [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 6);

  return (
    <div className="space-y-5">
      {/* ---------------- Hero ---------------- */}
      <Panel className="relative overflow-hidden">
        <LatticeField variant="hero" className="opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-900/90 via-ink-900/40 to-transparent" />
        <div className="relative grid items-center gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
          <div className="anim-in">
            <Badge tone="brand" dot>
              Context Governance Control Plane
            </Badge>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-fg md:text-[34px]">
              Evaluate human &amp; agent intent against governed{" "}
              <span className="text-gradient">Context Contracts</span>.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Discover enterprise semantics, deterministically compile authorized intent — bound to
              verified identities, delegation constraints and evidence — and trace every auditable
              disposition at scale.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate("neweval")}
                className="ring-focus inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-brand to-brand-dim px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(123,123,255,0.8)] transition-transform hover:brightness-110 active:scale-[0.98]"
              >
                <IconBeaker size={16} /> Run Evaluation
              </button>
              <button
                onClick={() => onNavigate("dispositions")}
                className="ring-focus inline-flex items-center gap-2 rounded-xl border border-line-bright bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-white/[0.06]"
              >
                Audit Dispositions <IconArrowRight size={15} />
              </button>
            </div>
          </div>

          <div className="anim-in flex flex-col items-center md:items-end">
            <RadialGauge value={kpis.posture} label="Posture" tone="brand" size={176} />
            <div className="mt-2 flex items-center gap-2">
              <Badge tone="emerald">Healthy</Badge>
              <span className="flex items-center gap-1 text-xs text-muted">
                <DeltaTag value={kpis.postureDelta} /> vs last week
              </span>
            </div>
          </div>
        </div>
      </Panel>

      {/* ---------------- KPI tiles ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Active Context Contracts"
          value={fmtNum(kpis.contracts)}
          icon={<IconShield size={15} />}
          tone="violet"
          delta={1.4}
          spark={[42, 43, 44, 45, 46, 47, 48]}
        />
        <StatTile
          label="Dispositions · 24h"
          value={fmtCompact(kpis.dispositions24h)}
          icon={<IconBolt size={15} />}
          tone="cyber"
          delta={6.1}
          spark={trendSeries.map((t) => t.disp)}
        />
        <StatTile
          label="Eval Pass Rate"
          value={fmtPct(kpis.passRate)}
          icon={<IconBeaker size={15} />}
          tone="emerald"
          delta={kpis.passDelta}
          spark={trendSeries.map((t) => t.pass)}
        />
        <StatTile
          label="Outliers Flagged"
          value={fmtNum(kpis.outliers)}
          icon={<IconCrosshair size={15} />}
          tone="amber"
          delta={kpis.outliersDelta}
          invert
          spark={[180, 165, 172, 158, 149, 144, 137]}
        />
      </div>

      {/* ---------------- Compilation pipeline ---------------- */}
      <Panel className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <SectionLabel>Deterministic Compilation</SectionLabel>
            <h2 className="mt-1 text-sm font-semibold text-fg">Intent → Disposition pipeline · last 24h</h2>
          </div>
          <Badge tone="neutral" dot>
            <Dot tone="emerald" pulse /> live
          </Badge>
        </div>
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
          {pipelineStages.map((s, i) => {
            const Ic = stageIcon[s.key];
            return (
              <div key={s.key} className="flex items-stretch">
                <div className="relative min-w-[150px] flex-1 rounded-xl border border-line bg-ink-825/60 p-3.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg"
                      style={{ background: `${TONES[s.tone]}1a`, color: TONES[s.tone] }}
                    >
                      <Ic size={15} />
                    </span>
                    <span className="text-[11px] font-medium text-faint">{s.label}</span>
                  </div>
                  <div className="mono mt-2 text-xl font-semibold text-fg tnum">
                    {fmtCompact(s.value)}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-faint">{s.sub}</div>
                  <div
                    className="absolute inset-x-0 bottom-0 h-[2px] rounded-full opacity-70"
                    style={{ background: `linear-gradient(90deg, ${TONES[s.tone]}, transparent)` }}
                  />
                </div>
                {i < pipelineStages.length - 1 && (
                  <div className="flex items-center px-1.5">
                    <div className="relative h-px w-7 bg-line-bright">
                      <div
                        className="anim-dash-fast absolute inset-0"
                        style={{
                          backgroundImage: `repeating-linear-gradient(90deg, ${TONES[s.tone]} 0 4px, transparent 4px 8px)`,
                        }}
                      />
                    </div>
                    <IconChevronRight size={13} className="text-dim" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ---------------- Trend + disposition mix ---------------- */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionLabel>Quality Trend</SectionLabel>
              <h2 className="mt-1 text-sm font-semibold text-fg">14-day governance signal</h2>
            </div>
            <div className="inline-flex rounded-xl bg-ink-825 p-0.5 ring-1 ring-inset ring-line">
              {(["pass", "vol", "disp"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={
                    "relative rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors " +
                    (metric === m ? "text-fg" : "text-muted hover:text-fg")
                  }
                >
                  {metric === m && (
                    <span className="absolute inset-0 rounded-[10px] bg-ink-700 ring-1 ring-inset ring-line-bright" />
                  )}
                  <span className="relative">
                    {m === "pass" ? "Pass Rate" : m === "vol" ? "Eval Volume" : "Dispositions"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <AreaTrend points={points} tone="brand" formatY={fmtY} formatTip={fmtTip} height={230} />
        </Panel>

        <Panel className="flex flex-col p-5">
          <SectionLabel>Disposition Mix</SectionLabel>
          <h2 className="mt-1 text-sm font-semibold text-fg">Verdict distribution · 24h</h2>
          <div className="flex flex-1 flex-col items-center justify-center py-3">
            <Donut
              segments={dispositionMix}
              size={168}
              center={
                <>
                  <span className="mono text-2xl font-semibold text-fg tnum">
                    {fmtCompact(kpis.dispositions24h)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-faint">total</span>
                </>
              }
            />
          </div>
          <div className="space-y-2">
            {dispositionMix.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONES[s.tone] }} />
                  {s.label}
                </span>
                <span className="mono font-semibold text-fg tnum">{fmtPct(s.value)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ---------------- Recent runs + human vs agent ---------------- */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between p-5 pb-3">
            <div>
              <SectionLabel>Recent Activity</SectionLabel>
              <h2 className="mt-1 text-sm font-semibold text-fg">Latest evaluation runs</h2>
            </div>
            <button
              onClick={() => onNavigate("runs")}
              className="ring-focus inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-bright hover:bg-brand/10"
            >
              View all <IconChevronRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-line/70">
            {recent.map((r) => {
              const tone = r.status === "failed" ? "rose" : r.status === "running" ? "cyber" : r.status === "queued" ? "amber" : "emerald";
              return (
                <div
                  key={r.id}
                  onClick={() => onNavigate("runs")}
                  className="group flex cursor-pointer items-center gap-4 px-5 py-3 transition-colors hover:bg-white/[0.02]"
                >
                  <Avatar label={r.target} tone={r.targetType === "human" ? "violet" : r.targetType === "service" ? "blue" : "brand"} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-fg">{r.name}</span>
                      <span className="mono text-[10px] text-faint">{r.id}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
                      <Dot tone={tone} pulse={r.status === "running"} />
                      <span className="capitalize">{r.status}</span>
                      <span className="text-dim">·</span>
                      <span className="truncate">{r.target}</span>
                    </div>
                  </div>
                  <div className="hidden w-28 sm:block">
                    <div className="mb-1 flex justify-between text-[10px] text-faint">
                      <span>pass</span>
                      <span className="mono text-fg tnum">{fmtPct(r.passRate)}</span>
                    </div>
                    <Bar value={r.passRate * 100} tone={tone} height={5} />
                  </div>
                  <div className="hidden md:block">
                    <Sparkline data={r.trend} tone={tone} width={80} height={28} />
                  </div>
                  <div className="w-12 text-right">
                    <span className="mono text-sm font-semibold text-fg tnum">{r.score.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionLabel>Human vs Agent</SectionLabel>
          <h2 className="mt-1 text-sm font-semibold text-fg">Dimensional coverage</h2>
          <RadarChart
            axes={humanVsAgent.dimensions.map((d) => DIMENSION_LABELS[d].split(" ")[0])}
            series={[
              { name: "Human", values: humanVsAgent.human, tone: "violet" },
              { name: "Agent", values: humanVsAgent.agent, tone: "brand" },
            ]}
            size={240}
          />
          <div className="mt-1 flex items-center justify-center gap-5 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONES.violet }} /> Human
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONES.brand }} /> Agent
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
