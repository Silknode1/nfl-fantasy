import { useState } from 'react'
import type { Player } from '../types'
import { fmt } from './bits'

/** 10th and 90th percentile of a player's week: expected ± 1.28 weekly spreads, floor not below zero. */
export const Z90 = 1.2816
export function weekRange(p: Player, week: number) {
  const e = p.proj[String(week)] ?? 0
  if (e <= 0) return null
  return { floor: Math.max(0, e - Z90 * p.sd), exp: e, ceil: e + Z90 * p.sd }
}

const GROUP = (p: Player) => (p.slot === 'IR' ? 'IR' : p.slot === 'BE' ? 'Bench' : 'Starters')
const ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX']

/** Players across, points up: a bar from floor to ceiling with the expected score marked. */
export function RangeChart({ roster, week, onPick }: { roster: Player[]; week: number; onPick?: (p: Player) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const ps = [...roster].sort((a, b) => {
    const g = ['Starters', 'Bench', 'IR']
    const d = g.indexOf(GROUP(a)) - g.indexOf(GROUP(b))
    if (d) return d
    if (GROUP(a) === 'Starters') return ORDER.indexOf(a.slot!) - ORDER.indexOf(b.slot!)
    return (b.proj[String(week)] ?? 0) - (a.proj[String(week)] ?? 0)
  })
  const rows = ps.map((p) => ({ p, r: weekRange(p, week) }))
  const max = Math.max(10, ...rows.map((x) => x.r?.ceil ?? 0))
  const top = Math.ceil(max / 5) * 5
  const col = 56
  const pad = { l: 30, r: 8, t: 22, b: 92 }
  const W = pad.l + pad.r + col * rows.length
  const H = 330
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top)
  const ticks = Array.from({ length: Math.floor(top / 5) + 1 }, (_, i) => i * 5).filter((t, _i, a) => a.length <= 7 || t % 10 === 0)
  const cx = (i: number) => pad.l + col * i + col / 2
  const groups: { name: string; from: number; to: number }[] = []
  rows.forEach((x, i) => {
    const g = GROUP(x.p)
    if (groups.length && groups[groups.length - 1].name === g) groups[groups.length - 1].to = i
    else groups.push({ name: g, from: i, to: i })
  })
  const h = hover !== null ? rows[hover] : null
  const short = (n: string) => (n.length > 16 ? n.split(' ').slice(-1)[0] : n)
  return (
    <figure className="range">
      <div className="range-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 38 + rows.length * 40 }} role="img" aria-label={`Week ${week} floor, expected and ceiling points by player`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 6} y={y(t) + 3} className="tick" textAnchor="end">{t}</text>
            </g>
          ))}
          {groups.map((g) => (
            <g key={g.name}>
              {g.from > 0 && <line x1={pad.l + col * g.from} x2={pad.l + col * g.from} y1={pad.t - 14} y2={H - pad.b} className="divider" />}
              <text x={(cx(g.from) + cx(g.to)) / 2} y={pad.t - 10} className="group" textAnchor="middle">{g.name}</text>
            </g>
          ))}
          {rows.map(({ p, r }, i) => (
            <g key={p.id} className={hover === i ? 'col on' : 'col'} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onClick={() => onPick?.(p)} style={{ cursor: onPick ? 'pointer' : undefined }}>
              <rect x={pad.l + col * i} y={pad.t} width={col} height={H - pad.t - pad.b} className="hit" />
              {r ? (
                <>
                  <line x1={cx(i)} x2={cx(i)} y1={y(r.floor)} y2={y(r.ceil)} className="span" />
                  <circle cx={cx(i)} cy={y(r.floor)} r={4.5} className="floor" />
                  <circle cx={cx(i)} cy={y(r.ceil)} r={4.5} className="ceil" />
                  <circle cx={cx(i)} cy={y(r.exp)} r={6.5} className="exp" />
                </>
              ) : (
                <text x={cx(i)} y={y(0) - 6} className="tick" textAnchor="middle">{p.bye === week ? 'bye' : 'out'}</text>
              )}
              <text transform={`translate(${cx(i) + 4},${H - pad.b + 12}) rotate(-50)`} className="name" textAnchor="end">{short(p.name)}</text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption>
        {h ? (
          <span>
            <b>{h.p.name}</b> {h.p.pos} {h.p.nfl}:{' '}
            {h.r ? <>ceiling <b className="c-ceil">{fmt(h.r.ceil)}</b>, expected <b className="c-exp">{fmt(h.r.exp)}</b>, floor <b className="c-floor">{fmt(h.r.floor)}</b></> : 'not projected to play this week'}
          </span>
        ) : (
          <span className="legend">
            <i className="k-ceil" />Ceiling (90th pct) <i className="k-exp" />Expected <i className="k-floor" />Floor (10th pct)
          </span>
        )}
      </figcaption>
    </figure>
  )
}
