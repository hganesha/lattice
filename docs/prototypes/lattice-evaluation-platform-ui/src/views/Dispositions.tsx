import { useMemo, useState } from "react";
import {
  Panel,
  Badge,
  Avatar,
  ChipButton,
  SectionLabel,
  KeyValue,
  fmtMs,
  TONES,
} from "@/components/primitives";
import {
  IconScroll,
  IconFingerprint,
  IconCube,
  IconLayers,
  IconArrowRight,
  IconLock,
  IconClock,
  IconLink,
  IconShield,
} from "@/components/icons";
import {
  dispositions,
  type DispositionRow,
  type DispositionVerdict,
  type IdentityKind,
} from "@/data/lattice";
import type { Env } from "@/data/lattice";

const verdictTone: Record<DispositionVerdict, "emerald" | "rose" | "amber"> = {
  allowed: "emerald",
  denied: "rose",
  conditioned: "amber",
};
const kindIcon: Record<IdentityKind, typeof IconCube> = {
  human: IconFingerprint,
  agent: IconCube,
  service: IconLayers,
};
const kindTone: Record<IdentityKind, "violet" | "brand" | "blue"> = {
  human: "violet",
  agent: "brand",
  service: "blue",
};

export default function Dispositions({ query, env }: { query: string; env: Env }) {
  const [verdict, setVerdict] = useState<"all" | DispositionVerdict>("all");
  const [selId, setSelId] = useState<string>(dispositions[0].id);
  void env;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dispositions.filter((d) => {
      if (verdict !== "all" && d.verdict !== verdict) return false;
      if (q && !`${d.id} ${d.intent} ${d.identity} ${d.compiledHash} ${d.policyRef}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, verdict]);

  const sel = filtered.find((d) => d.id === selId) ?? filtered[0] ?? dispositions[0];

  const counts = {
    allowed: dispositions.filter((d) => d.verdict === "allowed").length,
    conditioned: dispositions.filter((d) => d.verdict === "conditioned").length,
    denied: dispositions.filter((d) => d.verdict === "denied").length,
  };
  const avgLatency = Math.round(dispositions.reduce((s, d) => s + d.latencyMs, 0) / dispositions.length);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Audit Trail</SectionLabel>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">Dispositions</h1>
          <p className="mt-1 text-sm text-muted">
            Every authorized intent, deterministically compiled into a governed, auditable disposition.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="mono text-lg font-semibold text-fg tnum">{fmtMs(avgLatency)}</div>
            <div className="text-[11px] text-faint">avg compile latency</div>
          </div>
        </div>
      </div>

      {/* summary */}
      <div className="grid grid-cols-3 gap-3">
        {(["allowed", "conditioned", "denied"] as DispositionVerdict[]).map((v) => (
          <Panel key={v} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${TONES[verdictTone[v]]}1a`, color: TONES[verdictTone[v]] }}>
                {v === "allowed" ? <IconShield size={16} /> : v === "conditioned" ? <IconLock size={16} /> : <IconScroll size={16} />}
              </span>
              <div>
                <div className="capitalize text-sm font-medium text-fg">{v}</div>
                <div className="text-[11px] text-faint">dispositions</div>
              </div>
            </div>
            <span className="mono text-xl font-semibold text-fg tnum">{counts[v]}</span>
          </Panel>
        ))}
      </div>

      {/* filters */}
      <Panel className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <ChipButton active={verdict === "all"} onClick={() => setVerdict("all")}>All</ChipButton>
          {(["allowed", "conditioned", "denied"] as DispositionVerdict[]).map((v) => (
            <ChipButton key={v} active={verdict === v} onClick={() => setVerdict(v)}>
              <span className="capitalize">{v}</span>
            </ChipButton>
          ))}
        </div>
      </Panel>

      {/* master / detail */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1.25fr]">
        {/* list */}
        <Panel className="overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <SectionLabel>Dispositions · {filtered.length}</SectionLabel>
          </div>
          <div className="max-h-[640px] divide-y divide-line/60 overflow-y-auto">
            {filtered.map((d) => {
              const active = d.id === sel?.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelId(d.id)}
                  className={
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors " +
                    (active ? "bg-brand/[0.06]" : "hover:bg-white/[0.02]")
                  }
                >
                  <span className="h-full w-0.5 self-stretch rounded-full" style={{ background: active ? TONES[verdictTone[d.verdict]] : "transparent" }} />
                  <Avatar label={d.identity} tone={kindTone[d.identityKind]} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="mono text-[11px] text-faint">{d.id}</span>
                      <Badge tone={verdictTone[d.verdict]} size="sm" dot>
                        {d.verdict}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-fg">{d.intent}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                      <IconClock size={11} /> {d.ts.slice(11)} · <span className="mono">{fmtMs(d.latencyMs)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-faint">No matching dispositions.</div>
            )}
          </div>
        </Panel>

        {/* detail */}
        {sel && <DispositionDetail d={sel} />}
      </div>
    </div>
  );
}

function DispositionDetail({ d }: { d: DispositionRow }) {
  const tone = verdictTone[d.verdict];
  return (
    <Panel className="flex flex-col p-5">
      {/* head */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Compiled Disposition</SectionLabel>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="mono text-sm font-semibold text-fg">{d.compiledHash}</span>
            <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-faint">{d.id}</span>
          </div>
        </div>
        <Badge tone={tone} dot>
          <span className="capitalize">{d.verdict}</span>
        </Badge>
      </div>

      {/* intent */}
      <div className="mt-4 rounded-xl border border-line bg-ink-825/50 p-3.5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Authorized Intent</div>
        <div className="text-sm text-fg">{d.intent}</div>
      </div>

      {/* delegation chain */}
      <div className="mt-5">
        <SectionLabel className="mb-3">Delegation Chain</SectionLabel>
        <div className="flex flex-wrap items-center gap-1.5">
          {d.delegation.map((node, i) => {
            const Ic = kindIcon[node.kind];
            const kt = kindTone[node.kind];
            return (
              <div key={i} className="flex items-center gap-1.5">
                <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-825/60 px-2.5 py-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${TONES[kt]}1a`, color: TONES[kt] }}>
                    <Ic size={14} />
                  </span>
                  <div className="leading-tight">
                    <div className="mono text-[11px] font-medium text-fg">{node.label}</div>
                    <div className="text-[9px] uppercase tracking-wider text-faint">{node.kind}</div>
                  </div>
                </div>
                {i < d.delegation.length - 1 && (
                  <div className="flex flex-col items-center">
                    <IconArrowRight size={14} className="text-dim" />
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex flex-col items-center">
            <IconArrowRight size={14} className="text-dim" />
          </div>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-inset"
            style={{ background: `${TONES[tone]}14`, boxShadow: `inset 0 0 0 1px ${TONES[tone]}33` }}
          >
            <IconShield size={15} style={{ color: TONES[tone] }} />
            <span className="text-xs font-semibold capitalize" style={{ color: TONES[tone] }}>
              {d.verdict}
            </span>
          </div>
        </div>
      </div>

      {/* evidence */}
      <div className="mt-5">
        <SectionLabel className="mb-3">Cryptographic Evidence · {d.evidence.length}</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {d.evidence.map((e) => (
            <span
              key={e}
              className="mono inline-flex items-center gap-1.5 rounded-lg border border-line bg-ink-825/60 px-2.5 py-1.5 text-[11px] text-muted"
            >
              <IconLink size={12} className="text-brand-bright" />
              {e}
            </span>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
          <IconLock size={12} /> Content-addressed &amp; tamper-evident · referenced at compile time
        </p>
      </div>

      {/* meta */}
      <div className="mt-5 rounded-xl border border-line bg-ink-825/50 p-3">
        <KeyValue k="Policy reference" v={d.policyRef} />
        <KeyValue k="Context contract" v={<span className="mono">{d.contractId}</span>} />
        <KeyValue k="Channel" v={<span className="capitalize">{d.channel}</span>} />
        <KeyValue k="Timestamp" v={<span className="mono">{d.ts}</span>} />
        <KeyValue k="Compile latency" v={<span className="mono">{fmtMs(d.latencyMs)}</span>} />
      </div>
    </Panel>
  );
}
