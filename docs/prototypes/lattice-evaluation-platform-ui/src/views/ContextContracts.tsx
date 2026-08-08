import { useMemo, useState } from "react";
import {
  Panel,
  Badge,
  Bar,
  ChipButton,
  SectionLabel,
  DeltaTag,
  fmtNum,
  TONES,
} from "@/components/primitives";
import {
  IconContract,
  IconShield,
  IconLink,
  IconClock,
  IconLayers,
  IconScale,
  IconCube,
} from "@/components/icons";
import { contracts, type ContextContract } from "@/data/lattice";
import type { Env } from "@/data/lattice";

const healthTone: Record<ContextContract["health"], "emerald" | "amber" | "rose"> = {
  healthy: "emerald",
  watch: "amber",
  degraded: "rose",
};

export default function ContextContracts({ query, env }: { query: string; env: Env }) {
  const [health, setHealth] = useState<"all" | ContextContract["health"]>("all");
  void env;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts.filter((c) => {
      if (health !== "all" && c.health !== health) return false;
      if (q && !`${c.name} ${c.id} ${c.scope} ${c.standards.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, health]);

  const avgCoverage = Math.round(contracts.reduce((s, c) => s + c.coverage, 0) / contracts.length);
  const totalControls = contracts.reduce((s, c) => s + c.controls, 0);
  const totalBindings = contracts.reduce((s, c) => s + c.bindings, 0);
  const healthy = contracts.filter((c) => c.health === "healthy").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Standards-Aligned Semantics</SectionLabel>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">Context Contracts</h1>
          <p className="mt-1 text-sm text-muted">
            Enterprise semantics discovered and compiled into governable, versioned contracts.
          </p>
        </div>
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Active contracts", value: fmtNum(contracts.length), icon: <IconContract size={15} />, tone: "violet" as const },
          { label: "Avg coverage", value: `${avgCoverage}%`, icon: <IconCube size={15} />, tone: "brand" as const },
          { label: "Policy controls", value: fmtNum(totalControls), icon: <IconShield size={15} />, tone: "cyber" as const },
          { label: "Identity bindings", value: Intl.NumberFormat("en", { notation: "compact" }).format(totalBindings), icon: <IconLink size={15} />, tone: "emerald" as const },
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
      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <ChipButton active={health === "all"} onClick={() => setHealth("all")}>All · {contracts.length}</ChipButton>
        {(["healthy", "watch", "degraded"] as ContextContract["health"][]).map((h) => (
          <ChipButton key={h} active={health === h} onClick={() => setHealth(h)}>
            <span className="capitalize">{h}</span> · {contracts.filter((c) => c.health === h).length}
          </ChipButton>
        ))}
        <span className="ml-auto text-[11px] text-faint">
          <span className="mono text-emerald">{healthy}</span>/{contracts.length} healthy
        </span>
      </Panel>

      {/* grid */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => {
          const tone = healthTone[c.health];
          return (
            <Panel key={c.id} hover className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand-bright">
                    <IconContract size={17} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{c.name}</span>
                      <span className="mono rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-faint">{c.version}</span>
                    </div>
                    <div className="mono mt-0.5 text-[10.5px] text-faint">{c.id}</div>
                  </div>
                </div>
                <Badge tone={tone} size="sm" dot>
                  <span className="capitalize">{c.health}</span>
                </Badge>
              </div>

              {/* coverage */}
              <div className="mt-4">
                <div className="mb-1 flex items-end justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-faint">Semantic coverage</span>
                  <span className="mono text-lg font-semibold text-fg tnum">{c.coverage}%</span>
                </div>
                <Bar value={c.coverage} tone={tone} height={7} />
              </div>

              {/* standards */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {c.standards.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-muted ring-1 ring-inset ring-line">
                    <IconScale size={10} className="text-faint" />
                    {s}
                  </span>
                ))}
              </div>

              {/* scope */}
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
                <IconLayers size={12} /> {c.scope}
              </div>

              {/* footer */}
              <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-3 text-[11px]">
                <div className="flex items-center gap-1.5 text-muted">
                  <IconShield size={12} className="text-faint" /> {c.controls} controls
                </div>
                <div className="flex items-center gap-1.5 text-muted">
                  <IconLink size={12} className="text-faint" /> {fmtNum(c.bindings)} bindings
                </div>
                <div className="flex items-center gap-1.5 text-muted">
                  <IconClock size={12} className="text-faint" /> {c.lastEval}
                </div>
                <div className="flex items-center gap-1.5">
                  drift <DeltaTag value={c.drift} />
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
