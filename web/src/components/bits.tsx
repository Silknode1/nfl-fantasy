import { useEffect, useState } from 'react'
import type { Player } from '../types'
import { useFocus } from '../focus'
import { useData } from '../dataContext'

const initials = (name: string) =>
  name
    .split(' ')
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')

/** Player photo with the jersey-style number that links it to the stat rail. */
export function Avatar({ p, size = 56, numbered = true }: { p: Player; size?: number; numbered?: boolean }) {
  const { numberOf, hover, setHover, setPinned } = useFocus()
  const { photos } = useData()
  const n = numbered ? numberOf(p.id) : null
  const src = photos?.[p.id] ?? p.photo
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  return (
    <button
      type="button"
      className={`avatar pos-${p.pos}${hover === p.id ? ' lit' : ''}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => setHover(p.id)}
      onMouseLeave={() => setHover(null)}
      onFocus={() => setHover(p.id)}
      onBlur={() => setHover(null)}
      onClick={() => setPinned(p)}
      aria-label={`${p.name}${n ? `, stat ${n}` : ''}. Open details`}
    >
      {failed ? <span className="avatar-initials">{initials(p.name)}</span> : <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />}
      {n && <span className="badge">{n}</span>}
    </button>
  )
}

export function InjuryTag({ p }: { p: Player }) {
  if (!p.inj || p.inj === 'ACTIVE') return null
  const short: Record<string, string> = { QUESTIONABLE: 'Q', DOUBTFUL: 'D', OUT: 'O', INJURY_RESERVE: 'IR', SUSPENSION: 'SSPD', DAY_TO_DAY: 'DTD' }
  return (
    <span className={`inj inj-${p.inj}`} title={p.injNote ?? p.inj}>
      {short[p.inj] ?? p.inj}
    </span>
  )
}

/** Chance an injured player plays this week; hidden for healthy players and for players ruled out. */
export function PlayChance({ p }: { p: Player }) {
  if (p.playP == null || p.playP >= 0.9 || p.playP <= 0 || !p.inj || p.inj === 'ACTIVE') return null
  return (
    <span className="playp" title="Chance he plays this week, from how often players with this injury tag and practice report have played (2025 and 2026)">
      {Math.round(p.playP * 100)}% to play
    </span>
  )
}

/** 'up' when his last 3 games run 15%+ above his season average, 'down' when 15%+ below. */
export function hot(p: Player): string {
  if (p.last3 == null || !p.gp || p.gp < 3 || p.ppg < 3) return ''
  return p.last3 >= p.ppg * 1.15 ? 'up' : p.last3 <= p.ppg * 0.85 ? 'down' : ''
}

/** Our rank vs ESPN's projection rank, e.g. WR9 vs WR21. */
export function RankDelta({ p }: { p: Player }) {
  if (!p.espnRank) return <span className="rank muted">{p.pos}{p.ourRank}</span>
  const diff = p.espnRank - p.ourRank
  const cls = diff >= 5 ? 'up' : diff <= -5 ? 'down' : 'flat'
  return (
    <span className={`rank ${cls}`} title={`Our rest-of-season rank ${p.pos}${p.ourRank}; ESPN projection rank ${p.pos}${p.espnRank}`}>
      {p.pos}{p.ourRank}
      <span className="rank-vs"> vs {p.espnRank}</span>
    </span>
  )
}

export function Meter({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <span className="meter" title={`${label}: ${(v * 100).toFixed(0)} of 100`}>
      <span className="meter-label">{label}</span>
      <span className="meter-track">
        <span className="meter-fill" style={{ width: `${v * 100}%` }} />
      </span>
    </span>
  )
}

export function GradeMark({ grade, size = 'lg' }: { grade: string; size?: 'sm' | 'lg' }) {
  const tone = grade.startsWith('A') || grade.startsWith('B') ? 'good' : grade.startsWith('C') ? 'mid' : 'bad'
  return (
    <span className={`grade grade-${size} grade-${tone}`} aria-label={`Grade ${grade}`}>
      {grade}
    </span>
  )
}

export const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–')
export const signed = (x: number, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d)
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`
