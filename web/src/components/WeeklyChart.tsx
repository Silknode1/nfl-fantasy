import { useState } from 'react'
import type { Player } from '../types'
import { useData } from '../dataContext'

/** Points by week: solid bars are scored, hollow bars are our projection. One series, no legend box needed. */
export function WeeklyChart({ p }: { p: Player }) {
  const d = useData()
  const [hover, setHover] = useState<number | null>(null)
  const weeks = Array.from({ length: d.meta.lastWeek }, (_, i) => i + 1)
  const vals = weeks.map((w) => {
    const a = p.actual[String(w)]
    const done = a !== undefined && (w < d.meta.week || p.locked)
    return { w, v: done ? a : p.proj[String(w)] ?? 0, done, bye: w === p.bye }
  })
  const max = Math.max(10, ...vals.map((x) => x.v))
  const W = 300
  const H = 120
  const pad = { l: 22, r: 4, t: 8, b: 18 }
  const bw = (W - pad.l - pad.r) / weeks.length
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const ticks = [0, Math.round(max / 2), Math.round(max)]
  const h = hover !== null ? vals[hover] : null
  return (
    <figure className="weekly">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.name} points by week`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 4} y={y(t) + 3} className="tick" textAnchor="end">{t}</text>
          </g>
        ))}
        <line x1={pad.l + bw * (d.meta.regularWeeks)} x2={pad.l + bw * d.meta.regularWeeks} y1={pad.t} y2={H - pad.b} className="divider" />
        {vals.map((x, i) => {
          const bx = pad.l + i * bw + 2
          const top = y(x.v)
          const hgt = Math.max(0, H - pad.b - top)
          return (
            <g key={x.w} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {x.bye ? (
                <text x={bx + (bw - 4) / 2} y={H - pad.b - 3} className="bye" textAnchor="middle">B</text>
              ) : (
                <rect x={bx} y={top} width={bw - 4} height={hgt} rx={2} className={x.done ? 'bar-done' : 'bar-proj'} />
              )}
              {(x.w === 1 || x.w % 4 === 0 || x.w === d.meta.lastWeek) && (
                <text x={bx + (bw - 4) / 2} y={H - 5} className="tick" textAnchor="middle">{x.w}</text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption>
        {h ? (
          <span>
            Week {h.w}: {h.bye ? 'bye' : `${h.v.toFixed(1)} pts ${h.done ? 'scored' : 'projected'}`}
          </span>
        ) : (
          <span>Solid: scored. Outline: projected. Line marks the playoffs.</span>
        )}
      </figcaption>
    </figure>
  )
}
