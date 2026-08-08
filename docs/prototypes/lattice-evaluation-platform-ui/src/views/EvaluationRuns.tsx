import { useMemo, useState, Fragment } from "react";
import {
  Panel,
  Badge,
  Bar,
  Avatar,
  ChipButton,
  SectionLabel,
  KeyValue,
  DeltaTag,
  fmtPct,
  fmtNum,
  fmtMs,
  TONES,
} from "@/components/primitives";
import { Sparkline } from "@/components/charts";
import {
  IconChevronDown,
  IconBeaker,
  IconCrosshair,
  IconClock,
  IconFilter,
} from "@/components/icons";
import { runs, outliers, DIMENSION_LABELS, type EvalRun, type RunStatus } from "@/data/lattice";
import type { Env } from "@/data/lattice";

const statusTone: Record<RunStatus, "emerald" | "cyber" | "rose" | "amber"> = {
  completed: "emerald",
  running: "cyber",
  failed: "rose",
  queued: "amber",
};

type SortKey = "score" | "passRate" | "outliers" | "samples" | "durationMs" | "startedAt";

export default function EvaluationRuns({ query, env, onNavigate }: { query: string; env: Env; onNavigate?: (v: "neweval") => void }) {
  const [status, setStatus] = useState<"all" | RunStatus>("all");
  const [type, setType] = useState<"all" | "agent" | "human" | "service">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "startedAt", dir: "desc" });
  const [expanded, setExpanded] = useState<string | null>("RUN-7841");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = runs.filter((r) => {
      if (r.env !== env) return false;
      if (status !== "all" && r.status !== status) return false;
      if (type !== "all" && r.targetType !== type) return false;
      if (q && !(`${r.name} ${r.id} ${r.target} ${r.contractId}`.toLowerCase().includes(q))) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      return (a[sort.key] as number) > (b[sort.key] as number) ? dir : -dir;
    });
    return list;
  }, [query, env, status, type, sort]);

  const stats = useMemo(() => {
    const tot = filtered.length;
    const pass = filtered.reduce((s, r) => s + r.passRate, 0) / (tot || 1);
    const samples = filtered.reduce((s, r) => s + r.samples, 0);
    const out = filtered.reduce((s, r) => s + r.outliers, 0);
    return { tot, pass, samples, out };
  }, [filtered]);

  const setSortKey = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const Th = ({ k, children, right }: { k?: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={right ? "text-right" : ""}>
      {k ? (
        <button
          onClick={() => setSortKey(k)}
          className="inline-flex items-center gap-1 transition-colors hover:text-fg"
        >
          {children}
          <IconChevronDown
            size={12}
            className={sort.key === k ? "text-brand-bright" : "text-dim"}
            style={{ transform: sort.key === k && sort.dir === "asc" ? "rotate(180deg)" : "none", transition: "transform .2s" }}
          />
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Evaluation Suite</SectionLabel>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">Evaluation Runs</h1>
          <p className="mt-1 text-sm text-muted">
            Test outputs and evaluate human &amp; agent intent against Context Contracts at scale.
          </p>
        </div>
        <button
          onClick={() => onNavigate?.("neweval")}
          className="ring-focus inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-brand to-brand-dim px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(123,123,255,0.8)] transition-transform hover:brightness-110 active:scale-[0.98]"
        >
          <IconBeaker size={16} /> New Evaluation
        </button>
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Runs in view", value: fmtNum(stats.tot), tone: "brand" as const, icon: <IconBeaker size={15} /> },
          { label: "Avg pass rate", value: fmtPct(stats.pass), tone: "emerald" as const, icon: <IconCrosshair size={15} /> },
          { label: "Samples evaluated", value: Intl.NumberFormat("en", { notation: "compact" }).format(stats.samples), tone: "cyber" as const, icon: <IconClock size={15} /> },
          { label: "Outliers surfaced", value: fmtNum(stats.out), tone: "amber" as const, icon: <IconCrosshair size={15} /> },
        ].map((s) => (
          <Panel key={s.label} className="flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${TONES[s.tone]}1a`, color: TONES[s.tone] }}>
              {s.icon}
            </span>
            <div>
              <div className="mono text-lg font-semibold text-fg tnum">{s.value}</div>
              <div className="text-[11px] text-faint">{s.label}</div>
            </div>
          </Panel>
        ))}
      </div>

      {/* filters */}
      <Panel className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 px-1 text-xs font-medium text-faint">
            <IconFilter size={14} /> Filters
          </span>
          <ChipButton active={status === "all"} onClick={() => setStatus("all")}>All</ChipButton>
          {(["running", "completed", "queued", "failed"] as RunStatus[]).map((s) => (
            <ChipButton key={s} active={status === s} onClick={() => setStatus(s)}>
              <span className="capitalize">{s}</span>
            </ChipButton>
          ))}
          <div className="mx-1 h-5 w-px bg-line" />
          {(["all", "agent", "human", "service"] as const).map((t) => (
            <ChipButton key={t} active={type === t} onClick={() => setType(t)}>
              <span className="capitalize">{t}</span>
            </ChipButton>
          ))}
        </div>
      </Panel>

      {/* table */}
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-medium uppercase tracking-wider text-faint [&>th]:px-4 [&>th]:py-3 [&>th]:text-left">
                <Th>Run</Th>
                <Th k="passRate">Pass rate</Th>
                <Th k="score">Score</Th>
                <Th k="outliers">Outliers</Th>
                <Th k="samples">Samples</Th>
                <Th k="durationMs">Duration</Th>
                <Th>Trend</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const open = expanded === r.id;
                const tone = statusTone[r.status];
                const rOutliers = outliers.filter((o) => o.runId === r.id);
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setExpanded(open ? null : r.id)}
                      className="group cursor-pointer border-b border-line/60 transition-colors hover:bg-white/[0.02] [&>td]:px-4 [&>td]:py-3"
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <IconChevronDown
                            size={15}
                            className="shrink-0 text-dim transition-transform"
                            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
                          />
                          <Avatar label={r.target} tone={r.targetType === "human" ? "violet" : r.targetType === "service" ? "blue" : "brand"} size={32} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-fg">{r.name}</span>
                              <Badge tone={tone} size="sm" dot={r.status === "running"}>
                                {r.status}
                              </Badge>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                              <span className="mono">{r.id}</span>
                              <span className="text-dim">·</span>
                              <span className="truncate">{r.target}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="w-28">
                          <div className="mb-1 flex justify-between text-[11px]">
                            <span className="mono text-fg tnum">{fmtPct(r.passRate)}</span>
                            <DeltaTag value={r.drift} />
                          </div>
                          <Bar value={r.passRate * 100} tone={tone} height={5} />
                        </div>
                      </td>
                      <td>
                        <span className="mono text-sm font-semibold text-fg tnum">{r.score.toFixed(1)}</span>
                      </td>
                      <td>
                        {r.outliers > 0 ? (
                          <span className="mono font-medium" style={{ color: TONES.amber }}>
                            {r.outliers}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="mono text-muted tnum">{fmtNum(r.samples)}</td>
                      <td className="mono text-muted tnum">{fmtMs(r.durationMs)}</td>
                      <td>
                        <Sparkline data={r.trend} tone={tone} width={84} height={28} />
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-line bg-ink-875/60">
                        <td colSpan={7} className="px-4 py-4">
                          <RunDetail run={r} rOutliers={rOutliers} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-faint">
              <IconBeaker size={22} />
            </div>
            <p className="text-sm text-muted">No runs match the current filters.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function RunDetail({ run, rOutliers }: { run: EvalRun; rOutliers: typeof outliers }) {
  const dims = Object.entries(run.dimensions) as [keyof typeof run.dimensions, number][];
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr_1fr]">
      {/* dimensions */}
      <div>
        <SectionLabel className="mb-3">Dimensional Breakdown</SectionLabel>
        <div className="space-y-2.5">
          {dims.map(([k, v]) => {
            const tone = v >= 90 ? "emerald" : v >= 80 ? "amber" : "rose";
            return (
              <div key={k}>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted">{DIMENSION_LABELS[k]}</span>
                  <span className="mono font-semibold text-fg tnum">{v}</span>
                </div>
                <Bar value={v} tone={tone} height={6} />
              </div>
            );
          })}
        </div>
      </div>

      {/* meta */}
      <div>
        <SectionLabel className="mb-3">Run Metadata</SectionLabel>
        <div className="rounded-xl border border-line bg-ink-825/50 p-3">
          <KeyValue k="Contract" v={<span className="mono">{run.contractId}</span>} />
          <KeyValue k="Environment" v={<span className="capitalize">{run.env}</span>} />
          <KeyValue k="Curator" v={run.curator} />
          <KeyValue k="Started" v={<span className="mono">{run.startedAt.slice(5, 16).replace("T", " ")}</span>} />
          <KeyValue k="Drift vs prior" v={<DeltaTag value={run.drift} />} />
        </div>
      </div>

      {/* outliers */}
      <div>
        <SectionLabel className="mb-3">Flagged Outliers · {rOutliers.length}</SectionLabel>
        {rOutliers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-faint">
            No outliers surfaced in this run.
          </div>
        ) : (
          <div className="space-y-2">
            {rOutliers.slice(0, 4).map((o) => (
              <div key={o.id} className="rounded-xl border border-line bg-ink-825/50 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="mono text-[11px] text-fg">{o.id}</span>
                  <Badge tone={o.severity === "critical" ? "rose" : o.severity === "high" ? "amber" : "neutral"} size="sm">
                    {o.severity}
                  </Badge>
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  <span className="capitalize">{o.dimension}</span> · exp {o.expected} →{" "}
                  <span style={{ color: TONES.rose }}>{o.actual}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
