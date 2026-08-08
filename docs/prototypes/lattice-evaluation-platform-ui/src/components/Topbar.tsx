import { useEffect, useRef } from "react";
import { IconSearch, IconBell, IconPlus, IconDashboard, IconChevronDown } from "./icons";
import { Segmented, Avatar } from "./primitives";
import type { Env } from "@/data/lattice";

export function Topbar({
  title,
  query,
  onQuery,
  env,
  onEnv,
  onMenu,
  onNewEval,
}: {
  title: string;
  query: string;
  onQuery: (v: string) => void;
  env: Env;
  onEnv: (e: Env) => void;
  onMenu: () => void;
  onNewEval?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-ink-950/70 px-4 backdrop-blur-xl md:px-6">
      {/* mobile menu */}
      <button
        onClick={onMenu}
        className="ring-focus -ml-1 rounded-lg p-2 text-muted hover:bg-white/[0.05] hover:text-fg lg:hidden"
        aria-label="Open menu"
      >
        <IconDashboard size={20} />
      </button>

      <div className="hidden items-center gap-2 text-sm md:flex">
        <span className="text-faint">Console</span>
        <span className="text-dim">/</span>
        <span className="font-medium text-fg">{title}</span>
      </div>

      {/* search */}
      <div className="relative ml-auto w-full max-w-md lg:ml-6">
        <IconSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search runs, contracts, identities, hashes…"
          className="ring-focus h-10 w-full rounded-xl border border-line bg-ink-825/80 pl-9 pr-16 text-sm text-fg placeholder:text-faint focus:border-brand/40"
        />
        <kbd className="mono absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-ink-800 px-1.5 py-0.5 text-[10px] text-faint sm:block">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2 md:ml-3">
        <div className="hidden sm:block">
          <Segmented
            value={env}
            onChange={(v) => onEnv(v as Env)}
            options={[
              { label: "Production", value: "Production" },
              { label: "Staging", value: "Staging" },
            ]}
          />
        </div>

        <button className="ring-focus relative hidden h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-white/[0.05] hover:text-fg sm:flex">
          <IconBell size={18} />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose" />
        </button>

        <button
          onClick={onNewEval}
          className="ring-focus inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-b from-brand to-brand-dim px-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(123,123,255,0.7)] transition-transform hover:brightness-110 active:scale-[0.98]"
        >
          <IconPlus size={16} />
          <span className="hidden md:inline">New Eval</span>
        </button>

        <div className="mx-1 hidden h-7 w-px bg-line sm:block" />

        <button className="ring-focus flex items-center gap-2 rounded-xl py-1 pl-1 pr-1.5 hover:bg-white/[0.04]">
          <Avatar label="human:k.holst" tone="brand" size={30} />
          <div className="hidden text-left leading-tight lg:block">
            <div className="text-xs font-semibold text-fg">K. Holst</div>
            <div className="text-[10px] text-faint">Eval Architect</div>
          </div>
          <IconChevronDown size={14} className="hidden text-faint lg:block" />
        </button>
      </div>
    </header>
  );
}
