import { useId, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { TONES, clamp } from "./primitives";
import type { Tone } from "@/data/lattice";

/* ---------------------------- Sparkline ----------------------------- */

export function Sparkline({
  data,
  tone = "brand",
  width = 116,
  height = 34,
  fill = true,
  strokeWidth = 1.6,
}: {
  data: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
}) {
  const id = useId().replace(/:/g, "");
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`sl-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TONES[tone]} stopOpacity={0.34} />
          <stop offset="100%" stopColor={TONES[tone]} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#sl-${id})`} />}
      <path d={line} fill="none" stroke={TONES[tone]} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={TONES[tone]} />
      <circle cx={last[0]} cy={last[1]} r={4.6} fill={TONES[tone]} opacity={0.22} />
    </svg>
  );
}

/* ----------------------------- MiniBars ----------------------------- */

export function MiniBars({
  data,
  tone = "brand",
  width = 90,
  height = 30,
}: {
  data: number[];
  tone?: Tone;
  width?: number;
  height?: number;
}) {
  const max = Math.max(...data) || 1;
  const bw = width / data.length;
  return (
    <svg width={width} height={height}>
      {data.map((v, i) => {
        const h = (v / max) * (height - 3);
        return (
          <rect
            key={i}
            x={i * bw + 1}
            y={height - h}
            width={bw - 2.5}
            height={h}
            rx={1.4}
            fill={TONES[tone]}
            opacity={0.35 + (v / max) * 0.65}
          />
        );
      })}
    </svg>
  );
}

/* ----------------------------- AreaTrend ---------------------------- */

export function AreaTrend({
  points,
  tone = "brand",
  height = 210,
  formatY = (v: number) => `${v.toFixed(2)}`,
  formatTip,
}: {
  points: { label: string; value: number }[];
  tone?: Tone;
  height?: number;
  formatY?: (v: number) => string;
  formatTip?: (v: number) => string;
}) {
  const id = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.18 || 0.02;
  const min = lo - pad;
  const max = hi + pad;
  const W = 640;
  const H = height;
  const padX = 8;
  const padTop = 16;
  const padBottom = 26;
  const x = (i: number) => padX + (i / (n - 1)) * (W - padX * 2);
  const y = (v: number) => padTop + (1 - (v - min) / (max - min || 1)) * (H - padTop - padBottom);
  const linePts = points.map((p, i) => [x(i), y(p.value)] as const);
  const line = linePts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H - padBottom} L${x(0).toFixed(1)},${H - padBottom} Z`;
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="block"
      >
        <defs>
          <linearGradient id={`at-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TONES[tone]} stopOpacity={0.38} />
            <stop offset="100%" stopColor={TONES[tone]} stopOpacity={0} />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <line
            key={i}
            x1={padX}
            x2={W - padX}
            y1={y(t)}
            y2={y(t)}
            stroke="#ffffff"
            strokeOpacity={0.05}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={`url(#at-${id})`} />
        <path
          d={line}
          fill="none"
          stroke={TONES[tone]}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="draw-path"
          style={{ filter: `drop-shadow(0 6px 14px ${TONES[tone]}44)` }}
        />
        {active !== null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={padTop - 8}
            y2={H - padBottom}
            stroke={TONES[tone]}
            strokeOpacity={0.5}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            strokeDasharray="3 3"
          />
        )}
        {active !== null && (
          <circle cx={x(active)} cy={y(points[active].value)} r={4.5} fill={TONES[tone]} stroke="#0a0d17" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* y labels */}
      <div className="pointer-events-none absolute inset-y-3 left-0 flex flex-col justify-between text-[10px] text-faint">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="mono">{formatY(yTicks[ticks - i])}</span>
        ))}
      </div>
      {/* x labels */}
      <div className="pointer-events-none absolute inset-x-2 bottom-0 flex justify-between text-[10px] text-faint">
        {points.map((p, i) => (
          <span key={i} className={cn(i % 2 === 1 && "hidden sm:inline")}>{p.label.split(" ")[1]}</span>
        ))}
      </div>

      {/* hover layer */}
      <div
        className="absolute inset-0"
        onMouseLeave={() => setActive(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          const idx = Math.round(clamp(frac, 0, 1) * (n - 1));
          setActive(idx);
        }}
      >
        {active !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-line bg-ink-800/95 px-2.5 py-1.5 text-left shadow-xl backdrop-blur"
            style={{ left: `${(active / (n - 1)) * 100}%` }}
          >
            <div className="mono text-[10px] text-faint">{points[active].label}</div>
            <div className="mono text-xs font-semibold" style={{ color: TONES[tone] }}>
              {formatTip ? formatTip(points[active].value) : formatY(points[active].value)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------- RadialGauge ---------------------------- */

export function RadialGauge({
  value,
  size = 168,
  thickness = 12,
  tone = "brand",
  label,
  sub,
}: {
  value: number;
  size?: number;
  thickness?: number;
  tone?: Tone;
  label?: string;
  sub?: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamp(value) / 100);
  const cx = size / 2;
  const cy = size / 2;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`rg-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={TONES[tone]} />
            <stop offset="100%" stopColor={tone === "brand" ? "#29d4ee" : TONES[tone]} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff14" strokeWidth={thickness} strokeLinecap="round" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#rg-${id})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)", filter: `drop-shadow(0 0 10px ${TONES[tone]}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tracking-tight text-fg tnum">{value}</span>
        {label && <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</span>}
        {sub}
      </div>
    </div>
  );
}

/* ------------------------------ Donut ------------------------------- */

export function Donut({
  segments,
  size = 150,
  thickness = 16,
  center,
}: {
  segments: { label: string; value: number; tone: Tone }[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff10" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const seg = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={TONES[s.tone]}
              strokeWidth={thickness}
              strokeDasharray={`${len - 2} ${c - len + 2}`}
              strokeDashoffset={-acc}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 1s ease" }}
            />
          );
          acc += len;
          return seg;
        })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center">{center}</div>}
    </div>
  );
}

/* ---------------------------- RadarChart ---------------------------- */

export function RadarChart({
  axes,
  series,
  size = 260,
  max = 100,
}: {
  axes: string[];
  series: { name: string; values: number[]; tone: Tone }[];
  size?: number;
  max?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 30;
  const n = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, v: number) => {
    const rr = (v / max) * R;
    return [cx + Math.cos(angle(i)) * rr, cy + Math.sin(angle(i)) * rr] as const;
  };
  const ringPct = [0.25, 0.5, 0.75, 1];
  return (
    <svg width={size} height={size} className="mx-auto">
      {ringPct.map((p, ri) => (
        <polygon
          key={ri}
          points={axes
            .map((_, i) => {
              const [px, py] = point(i, max * p);
              return `${px.toFixed(1)},${py.toFixed(1)}`;
            })
            .join(" ")}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={ri === ringPct.length - 1 ? 0.12 : 0.06}
          strokeWidth={1}
        />
      ))}
      {axes.map((a, i) => {
        const [px, py] = point(i, max);
        return <line key={a} x1={cx} y1={cy} x2={px} y2={py} stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1} />;
      })}
      {series.map((s) => {
        const poly = s.values.map((v, i) => point(i, v).map((n) => n.toFixed(1)).join(",")).join(" ");
        return (
          <g key={s.name}>
            <polygon points={poly} fill={TONES[s.tone]} fillOpacity={0.14} stroke={TONES[s.tone]} strokeWidth={2} strokeLinejoin="round" />
            {s.values.map((v, i) => {
              const [px, py] = point(i, v);
              return <circle key={i} cx={px} cy={py} r={2.6} fill={TONES[s.tone]} />;
            })}
          </g>
        );
      })}
      {axes.map((a, i) => {
        const [px, py] = point(i, max + 18);
        return (
          <text
            key={a}
            x={px}
            y={py}
            textAnchor="middle"
            dominantBaseline="middle"
            className="mono"
            fontSize={8.5}
            fill="#5e6685"
            style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            {a}
          </text>
        );
      })}
    </svg>
  );
}

/* ------------------------------ Scatter ----------------------------- */

export function Scatter({
  points,
  width = 460,
  height = 280,
  max = 100,
}: {
  points: { x: number; y: number; out?: boolean; label?: string }[];
  width?: number;
  height?: number;
  max?: number;
}) {
  const pad = 34;
  const px = (v: number) => pad + (clamp(v) / max) * (width - pad - 12);
  const py = (v: number) => height - pad - (clamp(v) / max) * (height - pad - 12);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" className="block">
      {/* grid */}
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={px(g)} y1={py(0)} x2={px(g)} y2={py(100)} stroke="#ffffff" strokeOpacity={0.04} />
          <line x1={px(0)} y1={py(g)} x2={px(100)} y2={py(g)} stroke="#ffffff" strokeOpacity={0.04} />
          <text x={px(g)} y={height - pad + 14} textAnchor="middle" fontSize={8.5} fill="#5e6685" className="mono">{g}</text>
          <text x={pad - 8} y={py(g) + 3} textAnchor="end" fontSize={8.5} fill="#5e6685" className="mono">{g}</text>
        </g>
      ))}
      {/* diagonal reference */}
      <line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(100)} stroke="#7b7bff" strokeOpacity={0.22} strokeDasharray="4 4" />
      {points.map((p, i) => (
        <g key={i}>
          {p.out && <circle cx={px(p.x)} cy={py(p.y)} r={13} fill="#fb6f86" opacity={0.14} />}
          <circle
            cx={px(p.x)}
            cy={py(p.y)}
            r={p.out ? 5 : 3.4}
            fill={p.out ? "#fb6f86" : "#7b7bff"}
            opacity={p.out ? 1 : 0.55}
            stroke={p.out ? "#0a0d17" : "transparent"}
            strokeWidth={1}
          >
            {p.label && <title>{p.label}</title>}
          </circle>
        </g>
      ))}
      <text x={width / 2} y={height - 4} textAnchor="middle" fontSize={9} fill="#5e6685">EXPECTED SCORE</text>
      <text x={10} y={14} fontSize={9} fill="#5e6685">ACTUAL</text>
    </svg>
  );
}

/* ---------------------------- Histogram ----------------------------- */

export function Histogram({
  data,
  tone = "brand",
  height = 90,
}: {
  data: number[];
  tone?: Tone;
  height?: number;
}) {
  const max = Math.max(...data) || 1;
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-[3px]"
          style={{
            height: `${(v / max) * 100}%`,
            background: `linear-gradient(180deg, ${TONES[tone]}, ${TONES[tone]}55)`,
            minHeight: 2,
          }}
          title={`${v}`}
        />
      ))}
    </div>
  );
}
