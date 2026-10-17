'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fromDateKey, shortDate } from '@/lib/dates'

export type ChartPoint = {
  date: string
  value: number
  /** Shown under the value in the tooltip, e.g. the set it came from. */
  detail: string
  /** Drawn as an amber dot. */
  record: boolean
}

type ProgressChartProps = {
  /** Oldest first. */
  points: ChartPoint[]
  formatValue: (value: number) => string
  /** What the chart plots, for screen readers. */
  label: string
  today: string
}

const HEIGHT = 200
const MARGIN = { top: 22, right: 14, bottom: 26, left: 40 }
/** Past this many sessions, only the last point and records get a dot, so the line stays readable. */
const MAX_DOTS = 40

/** Round tick values covering [min, max], about `count` of them. */
function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    const pad = Math.max(1, Math.abs(max) * 0.05)
    min -= pad
    max += pad
  }
  const rough = (max - min) / (count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough)!
  const ticks: number[] = []
  for (let tick = Math.floor(min / step) * step; tick <= Math.ceil(max / step) * step + step / 2; tick += step) {
    ticks.push(Math.round(tick * 1000) / 1000)
  }
  return ticks
}

/** A single-series line over time, with a crosshair tooltip on hover and arrow-key focus. */
export function ProgressChart({ points, formatValue, label, today }: ProgressChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const times = points.map((point) => fromDateKey(point.date).getTime())
  const ticks = niceTicks(Math.min(...points.map((point) => point.value)), Math.max(...points.map((point) => point.value)))
  const yMin = ticks[0]
  const yMax = ticks.at(-1)!

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const span = times.at(-1)! - times[0]
  const x = (index: number) => MARGIN.left + (span === 0 ? plotWidth / 2 : ((times[index] - times[0]) / span) * plotWidth)
  const y = (value: number) => MARGIN.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight

  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point.value)}`).join('')
  const area = `${line}L${x(points.length - 1)},${y(yMin)}L${x(0)},${y(yMin)}Z`
  const last = points.length - 1

  const nearest = (clientX: number, element: Element) => {
    const offset = clientX - element.getBoundingClientRect().left
    return points.reduce((best, _, index) => (Math.abs(x(index) - offset) < Math.abs(x(best) - offset) ? index : best), 0)
  }

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => setActive(nearest(event.clientX, event.currentTarget))

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }
    if (!(event.key in moves)) return
    event.preventDefault()
    setActive((current) => Math.min(last, Math.max(0, (current ?? last) + moves[event.key])))
  }

  const activePoint = active === null ? null : points[active]

  return (
    <div ref={containerRef} className="relative" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${label}: from ${formatValue(points[0].value)} on ${shortDate(points[0].date, today)} to ${formatValue(points[last].value)} on ${shortDate(points[last].date, today)}`}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          className="touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-accent"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-sand-930)" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-sand-600 font-mono text-[10px] tabular-nums">
                {formatValue(tick)}
              </text>
            </g>
          ))}

          <text x={x(0)} y={HEIGHT - 6} textAnchor={span === 0 ? 'middle' : 'start'} className="fill-sand-600 font-mono text-[10px]">
            {shortDate(points[0].date, today)}
          </text>
          {span > 0 && (
            <text x={x(last)} y={HEIGHT - 6} textAnchor="end" className="fill-sand-600 font-mono text-[10px]">
              {shortDate(points[last].date, today)}
            </text>
          )}

          <path d={area} fill="var(--color-teal-accent)" opacity={0.1} />
          <path d={line} fill="none" stroke="var(--color-teal-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="var(--color-sand-800)" strokeWidth={1} />
          )}

          {points.map((point, index) =>
            points.length <= MAX_DOTS || point.record || index === last || index === active ? (
              <circle
                key={point.date}
                cx={x(index)}
                cy={y(point.value)}
                r={index === active ? 5.5 : 4}
                fill={point.record ? 'var(--color-amber-accent)' : 'var(--color-teal-accent)'}
                stroke="var(--color-sand-1000)"
                strokeWidth={2}
              />
            ) : null,
          )}

          {active === null && (
            <text x={x(last)} y={y(points[last].value) - 10} textAnchor={span === 0 ? 'middle' : 'end'} className="fill-ink-240 font-mono text-[11px] font-semibold">
              {formatValue(points[last].value)}
            </text>
          )}
        </svg>
      )}

      {activePoint && active !== null && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute top-0 z-10 w-max max-w-44 -translate-x-1/2 rounded-lg border border-sand-900 bg-sand-1000 px-2.5 py-1.5 shadow-dropdown"
          style={{ left: Math.min(Math.max(x(active), 70), width - 70) }}
        >
          <p className="font-mono text-[13px] font-semibold text-ink-240">{formatValue(activePoint.value)}</p>
          <p className="font-mono text-[11px] text-ink-480">
            {shortDate(activePoint.date, today)} · {activePoint.detail}
          </p>
          {activePoint.record && <p className="font-mono text-[11px] text-amber-text">★ Record</p>}
        </div>
      )}
    </div>
  )
}
