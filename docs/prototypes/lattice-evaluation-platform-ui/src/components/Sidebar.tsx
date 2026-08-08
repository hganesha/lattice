import { cn } from "@/utils/cn";
import {
  IconLogo,
  IconDashboard,
  IconBeaker,
  IconScroll,
  IconContract,
  IconOutlier,
  IconIdentity,
  IconScale,
  IconShield,
  IconSettings,
  IconClose,
} from "./icons";
import { Dot } from "./primitives";

export type ViewKey =
  | "overview"
  | "runs"
  | "dispositions"
  | "contracts"
  | "outliers"
  | "identities";

export const NAV: { key: ViewKey; label: string; icon: typeof IconDashboard; group: string }[] = [
  { key: "overview", label: "Overview", icon: IconDashboard, group: "Evaluate" },
  { key: "runs", label: "Evaluation Runs", icon: IconBeaker, group: "Evaluate" },
  { key: "outliers", label: "Outlier Analysis", icon: IconOutlier, group: "Evaluate" },
  { key: "dispositions", label: "Dispositions", icon: IconScroll, group: "Govern" },
  { key: "contracts", label: "Context Contracts", icon: IconContract, group: "Govern" },
  { key: "identities", label: "Identities", icon: IconIdentity, group: "Govern" },
];

const TITLES: Record<ViewKey, string> = {
  overview: "Overview",
  runs: "Evaluation Runs",
  outliers: "Outlier Analysis",
  dispositions: "Dispositions",
  contracts: "Context Contracts",
  identities: "Identities",
};

function NavButton({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "ring-focus group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
        active ? "text-fg" : "text-muted hover:text-fg hover:bg-white/[0.03]",
      )}
    >
      {active && (
        <>
          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-bright to-cyber" />
          <span className="absolute inset-0 rounded-xl bg-brand/[0.08] ring-1 ring-inset ring-brand/20" />
        </>
      )}
      <Icon
        size={18}
        className={cn("relative shrink-0 transition-colors", active ? "text-brand-bright" : "text-faint group-hover:text-muted")}
      />
      <span className="relative">{item.label}</span>
    </button>
  );
}

export function Sidebar({
  active,
  onSelect,
  onClose,
}: {
  active: ViewKey;
  onSelect: (v: ViewKey) => void;
  onClose?: () => void;
}) {
  const groups = ["Evaluate", "Govern"];
  return (
    <aside className="flex h-full w-[252px] flex-col border-r border-line bg-ink-900/80 backdrop-blur-xl">
      {/* brand */}
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <div className="flex items-center gap-2.5">
          <IconLogo size={30} />
          <div className="leading-tight">
            <div className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-fg">
              Lattice
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
              Eval Console
            </div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="ring-focus rounded-lg p-1.5 text-faint hover:text-fg lg:hidden">
            <IconClose size={18} />
          </button>
        )}
      </div>

      <div className="mx-4 h-px bg-line" />

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g} className="mb-1">
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">
              {g}
            </p>
            <div className="space-y-0.5">
              {NAV.filter((n) => n.group === g).map((item) => (
                <NavButton
                  key={item.key}
                  item={item}
                  active={active === item.key}
                  onClick={() => onSelect(item.key)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* system status */}
      <div className="px-3 pb-3">
        <div className="panel-2 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Dot tone="emerald" pulse />
            <span className="text-xs font-semibold text-fg">Deterministic Compiler</span>
          </div>
          <p className="mt-1 mono text-[10.5px] text-faint">compiler v4.2.1 · online</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
              <div className="text-faint">p50 latency</div>
              <div className="mono text-fg">312 ms</div>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
              <div className="text-faint">throughput</div>
              <div className="mono text-fg">2.1k/s</div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1">
          {[IconScale, IconShield, IconSettings].map((Ic, i) => (
            <button
              key={i}
              className="ring-focus flex flex-1 items-center justify-center rounded-lg py-2 text-faint transition-colors hover:bg-white/[0.04] hover:text-fg"
              title={["Policy Engine", "Audit Vault", "Settings"][i]}
            >
              <Ic size={16} />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

export const viewTitle = (v: ViewKey) => TITLES[v];
