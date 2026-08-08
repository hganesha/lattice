import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { Tone } from "@/data/lattice";

/* --------------------------- tone system ---------------------------- */

export const TONES: Record<Tone, string> = {
  neutral: "#969dbb",
  brand: "#7b7bff",
  cyber: "#29d4ee",
  emerald: "#34d399",
  amber: "#f5b13d",
  rose: "#fb6f86",
  blue: "#5b9bf5",
  violet: "#b39cff",
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  brand: "text-brand-bright",
  cyber: "text-cyber",
  emerald: "text-emerald",
  amber: "text-amber",
  rose: "text-rose",
  blue: "text-blue",
  violet: "text-violet",
};

const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-muted/10 text-muted ring-muted/20",
  brand: "bg-brand/10 text-brand-bright ring-brand/25",
  cyber: "bg-cyber/10 text-cyber ring-cyber/25",
  emerald: "bg-emerald/10 text-emerald ring-emerald/25",
  amber: "bg-amber/10 text-amber ring-amber/25",
  rose: "bg-rose/10 text-rose ring-rose/25",
  blue: "bg-blue/10 text-blue ring-blue/25",
  violet: "bg-violet/10 text-violet ring-violet/25",
};

/* ---------------------------- formatting ---------------------------- */

export const fmtPct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const fmtNum = (n: number) =>
  n >= 1000 ? n.toLocaleString("en-US") : `${n}`;
export const fmtCompact = (n: number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const fmtMs = (ms: number) => {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  return `${m}m ${rs}s`;
};
export const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
export const deltaTone = (d: number, invert = false): Tone => {
  const positive = invert ? d < 0 : d > 0;
  if (d === 0) return "neutral";
  return positive ? "emerald" : "rose";
};

/* ----------------------------- atoms -------------------------------- */

export function Panel({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "panel relative overflow-hidden",
        hover && "transition-colors duration-200 hover:border-line-bright",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className,
  size = "md",
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-xs",
        TONE_SOFT[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONES[tone] }} />}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ background: TONES[tone] }}
        />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: TONES[tone] }} />
    </span>
  );
}

export function Bar({
  value,
  tone = "brand",
  className,
  height = 6,
  track = true,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  height?: number;
  track?: boolean;
}) {
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full", track && "bg-white/[0.06]", className)}
      style={{ height }}
    >
      <div
        className="grow-x h-full rounded-full"
        style={{
          width: `${clamp(value)}%`,
          background: `linear-gradient(90deg, ${TONES[tone]}aa, ${TONES[tone]})`,
          boxShadow: `0 0 12px ${TONES[tone]}55`,
        }}
      />
    </div>
  );
}

export function Avatar({
  label,
  tone = "brand",
  size = 28,
}: {
  label: string;
  tone?: Tone;
  size?: number;
}) {
  const initials = label
    .replace(/^(agent|human|service|pipeline|svc|role|team):/, "")
    .split(/[\s-]/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-semibold ring-1 ring-inset"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        color: TONES[tone],
        background: `${TONES[tone]}1a`,
        boxShadow: `inset 0 0 0 1px ${TONES[tone]}33`,
      }}
    >
      {initials}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { label: ReactNode; value: T }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-xl bg-ink-825 p-0.5 ring-1 ring-inset ring-line", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "ring-focus relative rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {active && (
              <span className="absolute inset-0 rounded-[10px] bg-ink-700 ring-1 ring-inset ring-line-bright shadow-[0_4px_14px_-6px_rgba(123,123,255,0.5)]" />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  active = false,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "ring-focus relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-white/[0.05] hover:text-fg",
        active && "bg-brand/10 text-brand-bright",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.14em] text-faint", className)}>
      {children}
    </p>
  );
}

export function DeltaTag({ value, invert = false }: { value: number; invert?: boolean }) {
  const tone = deltaTone(value, invert);
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
        TONE_TEXT[tone],
      )}
    >
      {value > 0 ? "▲" : value < 0 ? "▼" : "–"}
      {value !== 0 ? `${Math.abs(value).toFixed(1)}` : "0.0"}
    </span>
  );
}

export function KeyValue({ k, v, mono = false }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-faint">{k}</span>
      <span className={cn("text-right text-xs text-fg", mono && "mono")}>{v}</span>
    </div>
  );
}

export function ChipButton({
  children,
  active,
  onClick,
  count,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "ring-focus inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-brand/12 text-brand-bright ring-1 ring-inset ring-brand/30"
          : "text-muted ring-1 ring-inset ring-line hover:bg-white/[0.04] hover:text-fg",
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            "mono rounded-md px-1 text-[10px]",
            active ? "bg-brand/20 text-brand-bright" : "bg-white/[0.06] text-faint",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function toneText(tone: Tone) {
  return TONE_TEXT[tone];
}
