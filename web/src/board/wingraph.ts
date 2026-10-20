/**
 * ESPN's in-game win-probability series placed on a game clock.
 * Every point is one ESPN sent. A point whose play has no clock is left off the time axis.
 * No series means no line.
 */

import { winSeries } from './desk'

const QUARTER = 900

export interface GraphPoint {
  /** Seconds of game time elapsed when the play ran. */
  t: number
  home: number
  away: number
}

export interface AxisTick {
  t: number
  /** Clock inside the quarter, e.g. "15:00", "7:30". */
  quarterClock: string
  /** Game time remaining at this tick in regulation, e.g. "52:30". Null in overtime. */
  gameLeft: string | null
  boundary: boolean
}

export interface PeriodBand {
  start: number
  end: number
  label: string
}

export interface LatestLabel {
  t: number
  home: number
  /** Leading team's abbreviation and its win percent. Null leader means exactly even. */
  leader: string | null
  pct: number
}

export interface WinGraph {
  /** True when points are placed by game clock; false when ESPN's play ids had no clock (play order only). */
  timed: boolean
  points: GraphPoint[]
  end: number
  ticks: AxisTick[]
  periods: PeriodBand[]
  latest: LatestLabel
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function clockSeconds(display: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(display.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Regular-season overtime is 10 minutes; postseason overtime is a full quarter. */
export function overtimeLength(raw: unknown): number {
  const header = isRec(raw) && isRec(raw.header) ? raw.header : {}
  const season = isRec(header.season) ? header.season : {}
  return num(season.type) === 3 ? QUARTER : 600
}

/** Elapsed game seconds at a quarter and quarter clock. */
export function elapsedAt(period: number, clock: number, otLength = 600): number {
  if (period <= 4) return (period - 1) * QUARTER + (QUARTER - Math.min(QUARTER, clock))
  return 4 * QUARTER + (period - 5) * otLength + (otLength - Math.min(otLength, clock))
}

/** Play id → elapsed seconds, from every drive play that carries a quarter and a clock. */
export function playClock(raw: unknown): Map<string, { t: number; period: number }> {
  const out = new Map<string, { t: number; period: number }>()
  const ot = overtimeLength(raw)
  const body = isRec(raw) ? raw : {}
  const drives = isRec(body.drives) ? body.drives : {}
  const rows = [...arr(drives.previous), ...(isRec(drives.current) ? [drives.current] : [])]
  for (const drive of rows) {
    if (!isRec(drive)) continue
    for (const play of arr(drive.plays)) {
      if (!isRec(play)) continue
      const id = typeof play.id === 'string' ? play.id : ''
      const period = isRec(play.period) ? num(play.period.number) : null
      const clock = isRec(play.clock) && typeof play.clock.displayValue === 'string' ? clockSeconds(play.clock.displayValue) : null
      if (!id || period == null || period < 1 || clock == null) continue
      out.set(id, { t: elapsedAt(period, clock, ot), period })
    }
  }
  return out
}

function tieOn(raw: unknown, playId: string | null): number {
  if (!isRec(raw) || !playId) return 0
  const list = arr(raw.winprobability)
  const row = list.find((r) => isRec(r) && r.playId === playId)
  const tie = isRec(row) ? num(row.tiePercentage) : null
  if (tie == null) return 0
  return Math.abs(tie) <= 1 ? tie * 100 : tie
}

export function axisTicks(periods: number, otLength = 600): AxisTick[] {
  const ticks: AxisTick[] = []
  const regulation = Math.min(4, periods)
  for (let q = 1; q <= regulation; q++) {
    const start = (q - 1) * QUARTER
    ticks.push({ t: start, quarterClock: '15:00', gameLeft: mmss(4 * QUARTER - start), boundary: true })
    ticks.push({ t: start + QUARTER / 2, quarterClock: '7:30', gameLeft: mmss(4 * QUARTER - start - QUARTER / 2), boundary: false })
  }
  ticks.push({ t: regulation * QUARTER, quarterClock: '0:00', gameLeft: regulation === 4 ? '0:00' : mmss(4 * QUARTER - regulation * QUARTER), boundary: true })
  for (let p = 5; p <= periods; p++) {
    const start = 4 * QUARTER + (p - 5) * otLength
    ticks.push({ t: start + otLength, quarterClock: '0:00', gameLeft: null, boundary: true })
  }
  return ticks
}

export function periodBands(periods: number, otLength = 600): PeriodBand[] {
  const names = ['1st', '2nd', '3rd', '4th']
  const out: PeriodBand[] = []
  for (let q = 1; q <= Math.min(4, periods); q++) out.push({ start: (q - 1) * QUARTER, end: q * QUARTER, label: names[q - 1]! })
  for (let p = 5; p <= periods; p++) {
    const start = 4 * QUARTER + (p - 5) * otLength
    out.push({ start, end: start + otLength, label: p === 5 ? 'OT' : `OT${p - 4}` })
  }
  return out
}

export function latestLabel(point: GraphPoint, homeAbbr: string, awayAbbr: string): LatestLabel {
  if (point.home > point.away) return { t: point.t, home: point.home, leader: homeAbbr, pct: round1(point.home) }
  if (point.away > point.home) return { t: point.t, home: point.home, leader: awayAbbr, pct: round1(point.away) }
  return { t: point.t, home: point.home, leader: null, pct: round1(point.home) }
}

/**
 * Null when ESPN sent no series. Otherwise the points on a full-game clock axis
 * (regulation, plus overtime periods that were played).
 */
export function winGraph(raw: unknown, homeAbbr: string, awayAbbr: string): WinGraph | null {
  const series = winSeries(raw)
  if (!series.length) return null
  const clocks = playClock(raw)
  const ot = overtimeLength(raw)
  const timedPoints: GraphPoint[] = []
  let lastPeriod = 4
  for (const point of series) {
    const at = point.playId ? clocks.get(point.playId) : undefined
    if (!at) continue
    lastPeriod = Math.max(lastPeriod, at.period)
    const tie = tieOn(raw, point.playId)
    timedPoints.push({ t: at.t, home: point.home, away: round1(Math.max(0, 100 - point.home - tie)) })
  }
  if (timedPoints.length >= 2) {
    const end = elapsedAt(lastPeriod, 0, ot)
    const points = timedPoints.sort((a, b) => a.t - b.t)
    return {
      timed: true,
      points,
      end,
      ticks: axisTicks(lastPeriod, ot),
      periods: periodBands(lastPeriod, ot),
      latest: latestLabel(points[points.length - 1]!, homeAbbr, awayAbbr),
    }
  }
  const points = series.map((point, i) => ({ t: i, home: point.home, away: round1(Math.max(0, 100 - point.home - tieOn(raw, point.playId))) }))
  return {
    timed: false,
    points,
    end: Math.max(1, points.length - 1),
    ticks: [],
    periods: [],
    latest: latestLabel(points[points.length - 1]!, homeAbbr, awayAbbr),
  }
}
