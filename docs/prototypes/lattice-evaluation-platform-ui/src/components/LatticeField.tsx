import { useMemo } from "react";
import { cn } from "@/utils/cn";

/**
 * LatticeField — the signature background motif.
 * A lattice of nodes (Context Contracts / identities) connected by edges,
 * with "authorized intent" flowing along select routes toward dispositions.
 */
export function LatticeField({
  className,
  cols = 11,
  rows = 6,
  variant = "hero",
}: {
  className?: string;
  cols?: number;
  rows?: number;
  variant?: "hero" | "faint";
}) {
  const vbW = 1000;
  const vbH = 520;
  const nodes = useMemo(() => {
    const list: { x: number; y: number; r: number; c: number; key: number }[] = [];
    let key = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const jitterX = ((r * 7 + c * 3) % 5) - 2;
        const jitterY = ((r * 5 + c * 11) % 5) - 2;
        list.push({
          x: 40 + (c / (cols - 1)) * (vbW - 80) + jitterX,
          y: 36 + (r / (rows - 1)) * (vbH - 72) + jitterY,
          r,
          c,
          key: key++,
        });
      }
    }
    return list;
  }, [cols, rows]);

  // orthogonal edges (right + down)
  const edges = useMemo(() => {
    const e: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const at = (r: number, c: number) => nodes[r * cols + c];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c < cols - 1) {
          const a = at(r, c);
          const b = at(r, c + 1);
          e.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        }
        if (r < rows - 1) {
          const a = at(r, c);
          const b = at(r + 1, c);
          e.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        }
      }
    }
    return e;
  }, [nodes, cols, rows]);

  // a few flowing routes (deterministic paths across the lattice)
  const routes = useMemo(() => {
    const path = (r0: number, c0: number, steps: [number, number][]) => {
      let r = r0;
      let c = c0;
      const segs = [];
      for (const [dr, dc] of steps) {
        const a = nodes[r * cols + c];
        r += dr;
        c += dc;
        const b = nodes[r * cols + c];
        segs.push(`${a.x.toFixed(1)},${a.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
      }
      return segs.join(" ");
    };
    return [
      { d: path(1, 1, [[0, 1], [1, 0], [0, 1], [1, 0]]), hue: "#7b7bff", dur: "26s" },
      { d: path(2, 8, [[1, -1], [1, 0], [0, -1], [1, 0]]), hue: "#29d4ee", dur: "32s" },
      { d: path(0, 5, [[1, 0], [0, 1], [1, 1], [1, 0]]), hue: "#b39cff", dur: "38s" },
      { d: path(3, 2, [[0, 1], [0, 1], [1, 0], [0, 1]]), hue: "#7b7bff", dur: "30s" },
    ];
  }, [nodes, cols, rows]);

  const activeNodes = nodes.filter((n) => (n.r * 13 + n.c * 7) % 9 === 0);
  const bright = variant === "hero";

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn("absolute inset-0 h-full w-full", className)}
      aria-hidden
    >
      <defs>
        <radialGradient id="lf-fade" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#0a0d17" stopOpacity="0" />
          <stop offset="82%" stopColor="#0a0d17" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0a0d17" stopOpacity="0.9" />
        </radialGradient>
      </defs>

      {/* base lattice edges */}
      <g stroke="#ffffff" strokeOpacity={bright ? 0.06 : 0.035}>
        {edges.map((e, i) => (
          <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} strokeWidth={1} />
        ))}
      </g>

      {/* flowing intent routes */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {routes.map((rt, i) => (
          <polyline
            key={i}
            points={rt.d}
            stroke={rt.hue}
            strokeWidth={1.6}
            strokeOpacity={bright ? 0.85 : 0.5}
            strokeDasharray="2 12"
            className="anim-dash"
            style={{ animationDuration: rt.dur, filter: `drop-shadow(0 0 4px ${rt.hue})` }}
          />
        ))}
      </g>

      {/* base nodes */}
      <g>
        {nodes.map((n) => (
          <circle key={n.key} cx={n.x} cy={n.y} r={1.5} fill="#5e6685" fillOpacity={bright ? 0.55 : 0.4} />
        ))}
      </g>

      {/* pulsing active nodes */}
      {activeNodes.map((n, i) => (
        <g key={`a-${n.key}`}>
          <circle
            cx={n.x}
            cy={n.y}
            r={4}
            fill="#7b7bff"
            opacity={0.25}
            style={{ animation: "nodePulse 4s ease-in-out infinite", animationDelay: `${(i % 6) * 0.5}s`, transformOrigin: `${n.x}px ${n.y}px` }}
          />
          <circle cx={n.x} cy={n.y} r={2} fill="#a6a7ff" />
        </g>
      ))}

      <rect x="0" y="0" width={vbW} height={vbH} fill="url(#lf-fade)" />
    </svg>
  );
}
