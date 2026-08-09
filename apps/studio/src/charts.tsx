import { useId, useState, type ReactNode } from 'react'
import type { ChartTone } from './formatters'
import './evaluation.css'

/**
 * Dependency-free inline SVG charts, ported selectively from the evaluation prototype (§9.2).
 *
 * Colour is never hard-coded: a tone class sets `color` from a design token and every mark
 * paints with `currentColor`, so light and dark both work. `RadarChart` is deliberately not
 * ported — the plan rejects it because it compares incommensurable dimensions on one polygon.
 * Every series is supplied by the caller; nothing here invents or samples data.
 */

export interface SeriesPoint {
  label: string
  value: number
}

export interface DonutSegment {
  label: string
  value: number
  tone: ChartTone
}

export interface ScatterPoint {
  x: number
  y: number
  outlier?: boolean
  label?: string
}

function toneClass(tone: ChartTone): string {
  return `chart-tone-${tone}`
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/* ------------------------------- Sparkline ------------------------------- */

interface SparklineProps {
  data: number[]
  label: string
  tone?: ChartTone
  width?: number
  height?: number
  fill?: boolean
  strokeWidth?: number
}

export function Sparkline({ data, label, tone = 'info', width = 116, height = 34, fill = true, strokeWidth = 1.6 }: SparklineProps) {
  const gradientId = `spark-${useId().replaceAll(':', '')}`
  if (data.length < 2) return null
  const minimum = Math.min(...data)
  const maximum = Math.max(...data)
  const span = maximum - minimum || 1
  const pad = 3
  const points = data.map((value, index) => [pad + (index / (data.length - 1)) * (width - pad * 2), height - pad - ((value - minimum) / span) * (height - pad * 2)] as const)
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return null
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ')
  return <svg className={`chart-sparkline ${toneClass(tone)}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={0.32} /><stop offset="100%" stopColor="currentColor" stopOpacity={0} /></linearGradient></defs>
    {fill && <path d={`${line} L${last[0].toFixed(1)},${height} L${first[0].toFixed(1)},${height} Z`} fill={`url(#${gradientId})`} />}
    <path d={line} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={last[0]} cy={last[1]} r={2.4} fill="currentColor" />
  </svg>
}

/* ------------------------------- AreaTrend ------------------------------- */

interface AreaTrendProps {
  points: SeriesPoint[]
  label: string
  tone?: ChartTone
  height?: number
  formatValue?: (value: number) => string
}

export function AreaTrend({ points, label, tone = 'info', height = 180, formatValue = (value) => value.toFixed(1) }: AreaTrendProps) {
  const gradientId = `area-${useId().replaceAll(':', '')}`
  const [active, setActive] = useState<number>()
  if (points.length < 2) return null
  const values = points.map((point) => point.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const cushion = (high - low) * 0.18 || 1
  const minimum = low - cushion
  const maximum = high + cushion
  const width = 640
  const padX = 10
  const padTop = 14
  const padBottom = 22
  const x = (index: number) => padX + (index / (points.length - 1)) * (width - padX * 2)
  const y = (value: number) => padTop + (1 - (value - minimum) / (maximum - minimum || 1)) * (height - padTop - padBottom)
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  const ticks = [0, 1, 2, 3, 4].map((index) => minimum + ((maximum - minimum) * index) / 4)
  const activePoint = active === undefined ? undefined : points[active]
  return <div className={`chart-area ${toneClass(tone)}`} style={{ height }}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={0.34} /><stop offset="100%" stopColor="currentColor" stopOpacity={0} /></linearGradient></defs>
      {ticks.map((tick) => <line className="chart-grid" key={tick} x1={padX} x2={width - padX} y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />)}
      <path d={`${line} L${x(points.length - 1).toFixed(1)},${height - padBottom} L${x(0).toFixed(1)},${height - padBottom} Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {active !== undefined && activePoint && <line className="chart-cursor" x1={x(active)} x2={x(active)} y1={padTop - 6} y2={height - padBottom} vectorEffect="non-scaling-stroke" />}
      {active !== undefined && activePoint && <circle cx={x(active)} cy={y(activePoint.value)} r={4} fill="currentColor" />}
    </svg>
    <div className="chart-area-y" aria-hidden="true">{[4, 3, 2, 1, 0].map((index) => <span key={index}>{formatValue(ticks[index] ?? 0)}</span>)}</div>
    <div className="chart-area-x" aria-hidden="true">{points.map((point, index) => <span key={`${point.label}-${index}`}>{point.label}</span>)}</div>
    <div className="chart-area-hover" onMouseLeave={() => setActive(undefined)} onMouseMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setActive(Math.round(clamp((event.clientX - rect.left) / rect.width, 0, 1) * (points.length - 1))) }}>
      {active !== undefined && activePoint && <div className="chart-tooltip" style={{ left: `${(active / (points.length - 1)) * 100}%` }}><small>{activePoint.label}</small><b>{formatValue(activePoint.value)}</b></div>}
    </div>
  </div>
}

/* --------------------------------- Donut --------------------------------- */

interface DonutProps {
  segments: DonutSegment[]
  label: string
  size?: number
  thickness?: number
  center?: ReactNode
}

export function Donut({ segments, label, size = 138, thickness = 16, center }: DonutProps) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  if (total <= 0) return null
  let offset = 0
  return <div className="chart-donut" style={{ width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle className="chart-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} />
        {segments.map((segment) => {
          const length = (segment.value / total) * circumference
          const dash = <circle className={toneClass(segment.tone)} key={segment.label} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={thickness} strokeDasharray={`${Math.max(0, length - 2)} ${circumference - length + 2}`} strokeDashoffset={-offset} strokeLinecap="butt"><title>{`${segment.label}: ${segment.value}`}</title></circle>
          offset += length
          return dash
        })}
      </g>
    </svg>
    {center && <div className="chart-donut-center">{center}</div>}
  </div>
}

/* ------------------------------- Histogram ------------------------------- */

interface HistogramProps {
  bins: SeriesPoint[]
  label: string
  tone?: ChartTone
  height?: number
}

export function Histogram({ bins, label, tone = 'info', height = 92 }: HistogramProps) {
  if (bins.length === 0) return null
  const maximum = Math.max(...bins.map((bin) => bin.value)) || 1
  const width = 320
  const slot = width / bins.length
  return <div className={`chart-histogram ${toneClass(tone)}`}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ height }}>
      {bins.map((bin, index) => { const barHeight = Math.max(2, (bin.value / maximum) * (height - 4)); return <rect key={`${bin.label}-${index}`} x={index * slot + 2} y={height - barHeight} width={Math.max(1, slot - 4)} height={barHeight} rx={2} fill="currentColor" fillOpacity={0.35 + (bin.value / maximum) * 0.6}><title>{`${bin.label}: ${bin.value}`}</title></rect> })}
    </svg>
    <div className="chart-histogram-x" aria-hidden="true">{bins.map((bin, index) => <span key={`${bin.label}-${index}`}>{bin.label}</span>)}</div>
  </div>
}

/* -------------------------------- Scatter -------------------------------- */

interface ScatterProps {
  points: ScatterPoint[]
  label: string
  xLabel: string
  yLabel: string
  width?: number
  height?: number
  max?: number
}

export function Scatter({ points, label, xLabel, yLabel, width = 460, height = 260, max = 100 }: ScatterProps) {
  if (points.length === 0) return null
  const pad = 34
  const px = (value: number) => pad + (clamp(value, 0, max) / max) * (width - pad - 14)
  const py = (value: number) => height - pad - (clamp(value, 0, max) / max) * (height - pad - 14)
  const gridValues = [0, 25, 50, 75, 100].map((percent) => (percent / 100) * max)
  return <svg className="chart-scatter" viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label}>
    {gridValues.map((value) => <g key={value}>
      <line className="chart-grid" x1={px(value)} y1={py(0)} x2={px(value)} y2={py(max)} />
      <line className="chart-grid" x1={px(0)} y1={py(value)} x2={px(max)} y2={py(value)} />
      <text className="chart-axis-text" x={px(value)} y={height - pad + 14} textAnchor="middle">{Math.round(value)}</text>
      <text className="chart-axis-text" x={pad - 8} y={py(value) + 3} textAnchor="end">{Math.round(value)}</text>
    </g>)}
    <line className="chart-reference" x1={px(0)} y1={py(0)} x2={px(max)} y2={py(max)} strokeDasharray="4 4" />
    {points.map((point, index) => <circle className={point.outlier ? 'chart-point outlier' : 'chart-point'} key={`${point.label ?? 'point'}-${index}`} cx={px(point.x)} cy={py(point.y)} r={point.outlier ? 5 : 3.4}>{point.label && <title>{point.label}</title>}</circle>)}
    <text className="chart-axis-label" x={width / 2} y={height - 4} textAnchor="middle">{xLabel}</text>
    <text className="chart-axis-label" x={10} y={14}>{yLabel}</text>
  </svg>
}
