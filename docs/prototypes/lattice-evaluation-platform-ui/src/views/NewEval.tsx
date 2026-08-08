import { useMemo, useState } from "react";
import {
  Panel,
  Badge,
  Bar,
  Avatar,
  ChipButton,
  SectionLabel,
  fmtNum,
  TONES,
} from "@/components/primitives";
import {
  IconBeaker,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconBolt,
  IconFingerprint,
  IconCube,
  IconLayers,
  IconSpark,
  IconUpload,
  IconLink,
  IconGauge,
  IconPlay,
} from "@/components/icons";
import { contracts, identities, DIMENSION_LABELS, type IdentityKind } from "@/data/lattice";
import type { ViewKey } from "@/components/Sidebar";

type Step = "target" | "contract" | "dimensions" | "dataset" | "review";

const STEP_ORDER: Step[] = ["target", "contract", "dimensions", "dataset", "review"];

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

export default function NewEval({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const [step, setStep] = useState<Step>("target");
  const [, setDirection] = useState<"next" | "back">("next");

  // form state
  const [targetId, setTargetId] = useState<string>("");
  const [contractId, setContractId] = useState<string>("");
  const [selectedDims, setSelectedDims] = useState<Set<string>>(new Set(Object.keys(DIMENSION_LABELS)));
  const [datasetSource, setDatasetSource] = useState<"live" | "upload" | "query">("live");
  const [sampleCount, setSampleCount] = useState<number>(5000);
  const [name, setName] = useState<string>("");

  const currentIndex = STEP_ORDER.indexOf(step);
  const canGoBack = currentIndex > 0;
  const canGoNext = currentIndex < STEP_ORDER.length - 1;
  const isLast = currentIndex === STEP_ORDER.length - 1;

  const next = () => {
    if (canGoNext) {
      setDirection("next");
      setStep(STEP_ORDER[currentIndex + 1]);
    }
  };
  const back = () => {
    if (canGoBack) {
      setDirection("back");
      setStep(STEP_ORDER[currentIndex - 1]);
    }
  };

  const target = identities.find((i) => i.id === targetId);
  const contract = contracts.find((c) => c.id === contractId);

  // generate name suggestion
  useMemo(() => {
    if (!name && target && contract) {
      const base = `${target.name} · ${contract.name} Evaluation`;
      setName(base.slice(0, 64));
    }
  }, [target, contract]);

  const toggleDim = (k: string) => {
    setSelectedDims((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const StepDot = ({ s, i }: { s: Step; i: number }) => {
    const active = step === s;
    const done = currentIndex > i;
    return (
      <button
        onClick={() => { setDirection(i > currentIndex ? "next" : "back"); setStep(s); }}
        className="group relative flex items-center gap-2"
      >
        <span
          className={
            "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all " +
            (active
              ? "bg-brand text-white ring-2 ring-brand/40"
              : done
              ? "bg-emerald/20 text-emerald ring-1 ring-inset ring-emerald/40"
              : "bg-ink-800 text-faint ring-1 ring-inset ring-line")
          }
        >
          {done ? <IconCheck size={14} /> : i + 1}
        </span>
        <span
          className={
            "hidden text-sm font-medium capitalize transition-colors md:block " +
            (active ? "text-fg" : done ? "text-emerald" : "text-faint")
          }
        >
          {s}
        </span>
        {i < STEP_ORDER.length - 1 && (
          <span className="mx-2 hidden h-px w-8 bg-line md:block" />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>New Evaluation</SectionLabel>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">Create Evaluation Run</h1>
          <p className="mt-1 text-sm text-muted">
            Configure a new evaluation targeting human or agent intent against a Context Contract.
          </p>
        </div>
        <button
          onClick={() => onNavigate("runs")}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-faint hover:bg-white/[0.04] hover:text-fg"
        >
          <IconChevronLeft size={14} /> Back to runs
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-2 border-b border-line pb-4">
        {STEP_ORDER.map((s, i) => (
          <StepDot key={s} s={s} i={i} />
        ))}
      </div>

      {/* Content */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {step === "target" && (
            <TargetStep selected={targetId} onSelect={setTargetId} />
          )}
          {step === "contract" && (
            <ContractStep selected={contractId} onSelect={setContractId} />
          )}
          {step === "dimensions" && (
            <DimensionsStep selected={selectedDims} onToggle={toggleDim} />
          )}
          {step === "dataset" && (
            <DatasetStep
              source={datasetSource}
              onSource={setDatasetSource}
              count={sampleCount}
              onCount={setSampleCount}
            />
          )}
          {step === "review" && (
            <ReviewStep
              target={target}
              contract={contract}
              dims={selectedDims}
              datasetSource={datasetSource}
              sampleCount={sampleCount}
              name={name}
              onName={setName}
            />
          )}
        </div>

        {/* Sidebar summary */}
        <div className="space-y-3">
          <Panel className="p-4">
            <SectionLabel className="mb-3">Configuration</SectionLabel>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-faint">Target</span>
                <span className={target ? "text-fg" : "text-faint"}>
                  {target ? target.name : "Not selected"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-faint">Contract</span>
                <span className={contract ? "text-fg" : "text-faint"}>
                  {contract ? contract.name : "Not selected"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-faint">Dimensions</span>
                <span className="text-fg">{selectedDims.size} / {Object.keys(DIMENSION_LABELS).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-faint">Samples</span>
                <span className="mono text-fg tnum">{fmtNum(sampleCount)}</span>
              </div>
            </div>
          </Panel>

          {target && contract && (
            <Panel className="p-4">
              <SectionLabel className="mb-3">Estimated Impact</SectionLabel>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-faint">Confidence</span>
                  <span className="mono text-emerald tnum">{Math.min(99, 85 + Math.floor(sampleCount / 1000)).toFixed(1)}%</span>
                </div>
                <Bar value={Math.min(100, 85 + sampleCount / 1000)} tone="emerald" height={5} />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-faint">Duration</span>
                  <span className="mono text-fg tnum">~{Math.max(2, Math.floor(sampleCount / 2000))}m</span>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-line pt-4">
        <button
          onClick={back}
          disabled={!canGoBack}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-white/[0.04] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <IconChevronLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-3">
          {isLast ? (
            <button
              onClick={() => onNavigate("runs")}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(52,211,153,0.6)] transition-transform hover:brightness-110 active:scale-[0.98]"
            >
              <IconPlay size={16} /> Launch Evaluation
            </button>
          ) : (
            <button
              onClick={next}
              disabled={
                (step === "target" && !targetId) ||
                (step === "contract" && !contractId)
              }
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-brand to-brand-dim px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(123,123,255,0.8)] transition-transform hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:hover:brightness-100"
            >
              Next <IconChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== STEP COMPONENTS ====================

function TargetStep({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | IdentityKind>("all");

  const filtered = identities.filter((i) =>
    filter === "all" ? true : i.kind === filter
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Select Target</h2>
        <p className="text-sm text-muted">Choose the human, agent, or service to evaluate.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <ChipButton active={filter === "all"} onClick={() => setFilter("all")}>All</ChipButton>
        {(["human", "agent", "service"] as IdentityKind[]).map((k) => (
          <ChipButton key={k} active={filter === k} onClick={() => setFilter(k)}>
            <span className="capitalize">{k}</span>
          </ChipButton>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((i) => {
          const active = selected === i.id;
          const Icon = kindIcon[i.kind];
          const tone = kindTone[i.kind];
          return (
            <button
              key={i.id}
              onClick={() => onSelect(i.id)}
              className={
                "text-left transition-all " +
                (active
                  ? "rounded-2xl bg-brand/10 p-4 ring-1 ring-inset ring-brand/40"
                  : "rounded-2xl border border-line bg-ink-875/50 p-4 hover:border-line-bright hover:bg-ink-825")
              }
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${TONES[tone]}1a`, color: TONES[tone] }}>
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg">{i.name}</span>
                    <Badge tone={tone} size="sm">{i.kind}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-faint">{i.role}</div>
                  <div className="mt-2 flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-muted">
                      <IconGauge size={11} /> Trust {i.trustLevel}
                    </span>
                    <span className="flex items-center gap-1 text-muted">
                      <IconBeaker size={11} /> {i.evals} evals
                    </span>
                  </div>
                </div>
                {active && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
                    <IconCheck size={12} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ContractStep({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Bind Context Contract</h2>
        <p className="text-sm text-muted">Select the standards-aligned contract governing this evaluation.</p>
      </div>

      <div className="grid gap-3">
        {contracts.map((c) => {
          const active = selected === c.id;
          const healthTone: Record<typeof c.health, "emerald" | "amber" | "rose"> = {
            healthy: "emerald",
            watch: "amber",
            degraded: "rose",
          };
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={
                "text-left transition-all " +
                (active
                  ? "rounded-2xl bg-brand/10 p-5 ring-1 ring-inset ring-brand/40"
                  : "rounded-2xl border border-line bg-ink-875/50 p-5 hover:border-line-bright hover:bg-ink-825")
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg">{c.name}</span>
                    <span className="mono rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-faint">
                      {c.version}
                    </span>
                    <Badge tone={healthTone[c.health]} size="sm" dot>
                      <span className="capitalize">{c.health}</span>
                    </Badge>
                  </div>
                  <div className="mono mt-1 text-[11px] text-faint">{c.id}</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.standards.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted ring-1 ring-inset ring-line"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <p className="mt-2 text-xs text-muted">{c.scope}</p>
                </div>

                <div className="w-24 shrink-0">
                  <div className="mb-1 flex justify-between text-[10px]">
                    <span className="text-faint">Coverage</span>
                    <span className="mono text-fg tnum">{c.coverage}%</span>
                  </div>
                  <Bar value={c.coverage} tone={healthTone[c.health]} height={5} />
                  <div className="mt-2 flex items-center justify-between text-[10px] text-faint">
                    <span>{c.controls} controls</span>
                    <span>{c.bindings} bindings</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DimensionsStep({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (k: string) => void;
}) {
  const allSelected = selected.size === Object.keys(DIMENSION_LABELS).length;
  const noneSelected = selected.size === 0;

  const toggleAll = () => {
    if (allSelected) {
      Object.keys(DIMENSION_LABELS).forEach(onToggle);
    } else {
      Object.keys(DIMENSION_LABELS).forEach((k) => {
        if (!selected.has(k)) onToggle(k);
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fg">Configure Dimensions</h2>
          <p className="text-sm text-muted">Select the evaluation dimensions to assess.</p>
        </div>
        <button
          onClick={toggleAll}
          className="text-xs font-medium text-brand-bright hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
          const active = selected.has(key);
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={
                "flex items-center gap-3 rounded-xl p-4 text-left transition-all " +
                (active
                  ? "bg-brand/10 ring-1 ring-inset ring-brand/40"
                  : "border border-line bg-ink-875/50 hover:border-line-bright")
              }
            >
              <span
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors " +
                  (active
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-ink-800")
                }
              >
                {active && <IconCheck size={12} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-fg">{label}</div>
                <div className="text-[11px] text-faint capitalize">{key} scoring</div>
              </div>
            </button>
          );
        })}
      </div>

      {noneSelected && (
        <div className="rounded-xl border border-rose/30 bg-rose/10 p-3 text-xs text-rose">
          Select at least one dimension to continue.
        </div>
      )}
    </div>
  );
}

function DatasetStep({
  source,
  onSource,
  count,
  onCount,
}: {
  source: "live" | "upload" | "query";
  onSource: (s: "live" | "upload" | "query") => void;
  count: number;
  onCount: (n: number) => void;
}) {
  const presets = [1000, 5000, 10000, 25000, 50000];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Dataset Configuration</h2>
        <p className="text-sm text-muted">Specify the data source and sample size for evaluation.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { key: "live", label: "Live Traffic", desc: "Real-time intent capture", icon: IconBolt },
          { key: "upload", label: "Upload Samples", desc: "JSONL or CSV batch", icon: IconUpload },
          { key: "query", label: "Query Store", desc: "From audit vault", icon: IconLink },
        ].map((opt) => {
          const Icon = opt.icon;
          const active = source === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onSource(opt.key as typeof source)}
              className={
                "rounded-xl p-4 text-left transition-all " +
                (active
                  ? "bg-brand/10 ring-1 ring-inset ring-brand/40"
                  : "border border-line bg-ink-875/50 hover:border-line-bright")
              }
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: active ? `${TONES.brand}1a` : "rgba(255,255,255,0.03)", color: active ? TONES.brand : "#969dbb" }}>
                <Icon size={18} />
              </span>
              <div className="mt-2 font-medium text-fg">{opt.label}</div>
              <div className="text-[11px] text-faint">{opt.desc}</div>
            </button>
          );
        })}
      </div>

      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-fg">Sample Size</span>
          <span className="mono text-lg font-semibold text-brand-bright tnum">{fmtNum(count)}</span>
        </div>
        <input
          type="range"
          min={100}
          max={100000}
          step={100}
          value={count}
          onChange={(e) => onCount(parseInt(e.target.value))}
          className="w-full accent-brand"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => onCount(p)}
              className={
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors " +
                (count === p
                  ? "bg-brand/20 text-brand-bright ring-1 ring-inset ring-brand/30"
                  : "bg-white/[0.03] text-faint hover:text-fg")
              }
            >
              {fmtNum(p)}
            </button>
          ))}
        </div>
      </Panel>

      {source === "upload" && (
        <div className="rounded-xl border-2 border-dashed border-line bg-ink-875/30 p-8 text-center">
          <IconUpload size={32} className="mx-auto text-faint" />
          <p className="mt-2 text-sm text-muted">Drop files here or click to upload</p>
          <p className="text-xs text-faint">Supports JSONL, CSV, Parquet up to 500MB</p>
        </div>
      )}
    </div>
  );
}

function ReviewStep({
  target,
  contract,
  dims,
  datasetSource,
  sampleCount,
  name,
  onName,
}: {
  target?: typeof identities[number];
  contract?: typeof contracts[number];
  dims: Set<string>;
  datasetSource: string;
  sampleCount: number;
  name: string;
  onName: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Review & Launch</h2>
        <p className="text-sm text-muted">Verify configuration before starting the evaluation.</p>
      </div>

      <Panel className="p-5">
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-faint">Evaluation Name</label>
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            className="ring-focus w-full rounded-xl border border-line bg-ink-825/80 px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-brand/40"
            placeholder="My Evaluation Run"
          />
        </div>

        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Target</div>
            {target ? (
              <div className="flex items-center gap-2">
                <Avatar label={target.name} tone={kindTone[target.kind]} size={28} />
                <div>
                  <div className="text-sm font-medium text-fg">{target.name}</div>
                  <div className="text-[11px] text-faint">{target.role}</div>
                </div>
              </div>
            ) : (
              <span className="text-sm text-faint">Not selected</span>
            )}
          </div>

          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Contract</div>
            {contract ? (
              <div>
                <div className="text-sm font-medium text-fg">{contract.name}</div>
                <div className="mono text-[11px] text-faint">{contract.id} · {contract.version}</div>
              </div>
            ) : (
              <span className="text-sm text-faint">Not selected</span>
            )}
          </div>

          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Dimensions</div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(dims).map((d) => (
                <Badge key={d} tone="brand" size="sm">
                  {DIMENSION_LABELS[d as keyof typeof DIMENSION_LABELS]}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Dataset</div>
            <div className="text-sm text-fg">
              <span className="capitalize">{datasetSource}</span> · <span className="mono tnum">{fmtNum(sampleCount)}</span> samples
            </div>
          </div>
        </div>
      </Panel>

      <div className="rounded-xl border border-emerald/30 bg-emerald/10 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald/20 text-emerald">
            <IconSpark size={16} />
          </span>
          <div>
            <div className="font-medium text-emerald">Ready to Launch</div>
            <p className="mt-0.5 text-xs text-emerald/80">
              This evaluation will compile intent against {contract?.controls || 0} policy controls and generate an auditable disposition trace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
