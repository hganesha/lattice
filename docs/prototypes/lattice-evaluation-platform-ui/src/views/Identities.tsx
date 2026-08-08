import { useMemo, useState } from "react";
import {
  Panel,
  Badge,
  Bar,
  ChipButton,
  SectionLabel,
  Dot,
  fmtPct,
  fmtNum,
  TONES,
} from "@/components/primitives";
import {
  IconIdentity,
  IconFingerprint,
  IconCube,
  IconLayers,
  IconClock,
  IconLink,
  IconShield,
  IconNode,
} from "@/components/icons";
import { identities, delegations, type IdentityKind, type IdentityRow } from "@/data/lattice";
import type { Env } from "@/data/lattice";

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
const postureTone: Record<IdentityRow["posture"], "emerald" | "amber" | "blue" | "rose"> = {
  verified: "emerald",
  delegated: "amber",
  rotating: "blue",
  quarantined: "rose",
};
const trustTone = (v: number): "emerald" | "amber" | "rose" => (v >= 80 ? "emerald" : v >= 60 ? "amber" : "rose");

// deterministic layout for the delegation graph
const POS: Record<string, { x: number; y: number }> = {
  "human:k.holst": { x: 70, y: 70 },
  "human:m.osei": { x: 70, y: 215 },
  "human:tier-1-ops": { x: 70, y: 340 },
  "agent:router-v4": { x: 330, y: 90 },
  "agent:resolver-prod": { x: 330, y: 210 },
  "agent:procure-bot": { x: 330, y: 330 },
  "agent:copilot-internal": { x: 590, y: 150 },
  "pipeline:ingest-edge": { x: 590, y: 300 },
};

function DelegationGraph() {
  return (
    <svg viewBox="0 0 680 400" width="100%" className="block">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#34406a" />
        </marker>
      </defs>

      {/* edges */}
      {delegations.map((e, i) => {
        const a = POS[e.from];
        const b = POS[e.to];
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2;
        const path = `M${a.x + 22},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x - 22},${b.y}`;
        return (
          <g key={i}>
            <path d={path} fill="none" stroke="#2a3253" strokeWidth={1.4} />
            <path
              d={path}
              fill="none"
              stroke={TONES.brand}
              strokeWidth={1.4}
              strokeOpacity={0.8}
              strokeDasharray="2 8"
              className="anim-dash"
              markerEnd="url(#arrow)"
            />
            <g transform={`translate(${mx}, ${(a.y + b.y) / 2 - 9})`}>
              <rect x="-30" y="-1" width="60" height="16" rx="4" fill="#0d101b" stroke="#1c2238" />
              <text x="0" y="10" textAnchor="middle" className="mono" fontSize={8.5} fill="#969dbb">
                {e.constraint}
              </text>
            </g>
          </g>
        );
      })}

      {/* nodes */}
      {Object.entries(POS).map(([id, p]) => {
        const r = identities.find((i) => i.id === id)!;
        const tone = kindTone[r.kind];
        const Ic = kindIcon[r.kind];
        const live = r.lastSeen === "live";
        return (
          <g key={id} transform={`translate(${p.x},${p.y})`}>
            <circle r="24" fill={`${TONES[tone]}14`} stroke={`${TONES[tone]}66`} strokeWidth={1.5} />
            <g transform="translate(-9,-9)" style={{ color: TONES[tone] }}>
              <Ic size={18} />
            </g>
            <text y="42" textAnchor="middle" className="mono" fontSize={9.5} fill="#eef1fb" fontWeight={600}>
              {r.name}
            </text>
            <text y="55" textAnchor="middle" className="mono" fontSize={8} fill="#5e6685">
              {r.kind}
            </text>
            {live && (
              <circle cx="16" cy="-16" r="3" fill={TONES.emerald}>
                <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function Identities({ query, env }: { query: string; env: Env }) {
  void env;
  const [kind, setKind] = useState<"all" | IdentityKind>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return identities.filter((i) => {
      if (kind !== "all" && i.kind !== kind) return false;
      if (q && !`${i.name} ${i.role} ${i.id} ${i.scope}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, kind]);

  const verified = identities.filter((i) => i.posture === "verified").length;
  const avgTrust = Math.round(identities.reduce((s, i) => s + i.trustLevel, 0) / identities.length);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Verified Principals</SectionLabel>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">Identities &amp; Delegation</h1>
          <p className="mt-1 text-sm text-muted">
            Humans, agents and services bound to constraints — every disposition traceable to a verified identity.
          </p>
        </div>
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Tracked identities", value: fmtNum(identities.length), icon: <IconIdentity size={15} />, tone: "brand" as const },
          { label: "Verified", value: `${verified}`, icon: <IconShield size={15} />, tone: "emerald" as const },
          { label: "Avg trust level", value: `${avgTrust}`, icon: <IconFingerprint size={15} />, tone: "violet" as const },
          { label: "Delegation edges", value: fmtNum(delegations.length), icon: <IconNode size={15} />, tone: "cyber" as const },
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

      {/* delegation graph */}
      <Panel className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <SectionLabel>Delegation Graph</SectionLabel>
            <h2 className="mt-1 text-sm font-semibold text-fg">Bound, constraint-scoped authority</h2>
          </div>
          <div className="hidden items-center gap-4 text-[11px] sm:flex">
            <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: TONES.violet }} /> human</span>
            <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: TONES.brand }} /> agent</span>
            <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: TONES.blue }} /> service</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <DelegationGraph />
        </div>
      </Panel>

      {/* filters */}
      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <ChipButton active={kind === "all"} onClick={() => setKind("all")}>All</ChipButton>
        {(["human", "agent", "service"] as IdentityKind[]).map((k) => (
          <ChipButton key={k} active={kind === k} onClick={() => setKind(k)}>
            <span className="capitalize">{k}</span> · {identities.filter((i) => i.kind === k).length}
          </ChipButton>
        ))}
      </Panel>

      {/* cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((i) => {
          const tone = kindTone[i.kind];
          const Ic = kindIcon[i.kind];
          const tt = trustTone(i.trustLevel);
          return (
            <Panel key={i.id} hover className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${TONES[tone]}1a`, color: TONES[tone] }}>
                    <Ic size={20} />
                    {i.lastSeen === "live" && (
                      <span className="absolute -right-1 -top-1"><Dot tone="emerald" pulse /></span>
                    )}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{i.name}</span>
                      <Badge tone={tone} size="sm">{i.kind}</Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint">{i.role}</div>
                  </div>
                </div>
                <Badge tone={postureTone[i.posture]} size="sm" dot>
                  <span className="capitalize">{i.posture}</span>
                </Badge>
              </div>

              {/* trust */}
              <div className="mt-4">
                <div className="mb-1 flex items-end justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-faint">Trust level</span>
                  <span className="mono text-lg font-semibold text-fg tnum">{i.trustLevel}</span>
                </div>
                <Bar value={i.trustLevel} tone={tt} height={7} />
              </div>

              {/* scope */}
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
                <IconLink size={12} /> {i.scope}
              </div>

              {/* stats */}
              <div className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                <div>
                  <div className="mono text-sm font-semibold text-emerald tnum">{fmtPct(i.passRate)}</div>
                  <div className="text-[10px] text-faint">pass rate</div>
                </div>
                <div>
                  <div className="mono text-sm font-semibold text-fg tnum">{i.evals}</div>
                  <div className="text-[10px] text-faint">evals</div>
                </div>
                <div>
                  <div className="mono text-sm font-semibold text-fg tnum">{i.delegations}</div>
                  <div className="text-[10px] text-faint">delegations</div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-faint">
                <IconClock size={11} /> {i.lastSeen}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
