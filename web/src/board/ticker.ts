/**
 * The Games ticker: the whole week as three or four horizontal rows of bubbles.
 * Every number on a bubble is copied from the scoreboard. A missing quote is an empty slot.
 */

import { formatLine, type BoardGame } from './normalize'
import { liveFirst } from './search'

export type TickDirection = 'left' | 'right'

export interface TickerRow {
  index: number
  direction: TickDirection
  games: BoardGame[]
}

export interface BubbleFacts {
  away: string
  home: string
  /** Score while live or final, "at" before kickoff. */
  middle: string
  /** Home line, e.g. "SF -3.5". Null when no quote was pulled. */
  spread: string | null
  /** "Final", "Final/OT", the live clock, or the kickoff time. */
  status: string
  live: boolean
}

/** Four rows once the week is longer than twelve games, else three. Tiny slates get one row per game. */
export function tickerRowCount(games: number): number {
  if (games <= 0) return 0
  if (games < 3) return games
  return games > 12 ? 4 : 3
}

/** Live-first order, cut into balanced contiguous rows, so live games land in the top rows. */
export function tickerRows(games: BoardGame[], rowCount = tickerRowCount(games.length)): TickerRow[] {
  const ordered = liveFirst(games)
  const rows = Math.max(0, Math.min(rowCount, ordered.length))
  const out: TickerRow[] = []
  let at = 0
  for (let i = 0; i < rows; i++) {
    const size = Math.floor(ordered.length / rows) + (i < ordered.length % rows ? 1 : 0)
    out.push({ index: i, direction: i % 2 === 0 ? 'left' : 'right', games: ordered.slice(at, at + size) })
    at += size
  }
  return out
}

const BASE_SPEED = [26, 21, 29, 23]
const DRIFT_PERIOD = [37, 43, 31, 53]

/** Pixels per second for a row at time t. Rows differ, and each drifts about 18% either way. */
export function rowSpeed(rowIndex: number, seconds: number): number {
  const i = rowIndex % BASE_SPEED.length
  const base = BASE_SPEED[i]!
  const drift = Math.sin((2 * Math.PI * seconds) / DRIFT_PERIOD[i]! + rowIndex * 1.7)
  return base * (1 + 0.18 * drift)
}

export function wrap(value: number, span: number): number {
  if (!(span > 0)) return 0
  return ((value % span) + span) % span
}

/**
 * translateX for a looping track made of two identical segments, each `span` wide.
 * A left row is [real][copy]; a right row is [copy][real]. At travelled = 0 the real
 * segment sits exactly in the viewport in both directions, so every bubble is fully
 * visible on first load and a focused bubble is never the hidden copy.
 */
export function trackOffset(direction: TickDirection, travelled: number, span: number): number {
  const d = wrap(travelled, span)
  return direction === 'left' ? -d : d - span
}

/** Animate only when one copy of the row fits the viewport; otherwise the row scrolls by hand. */
export function shouldAnimate(contentWidth: number, viewportWidth: number, reducedMotion: boolean): boolean {
  return !reducedMotion && viewportWidth > 0 && contentWidth > 0 && contentWidth <= viewportWidth
}

function kickoffShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

export function spreadSlot(game: BoardGame): string | null {
  const line = game.quote?.home.line
  if (line == null) return null
  return `${game.home.abbr} ${formatLine(line)}`
}

export function bubbleFacts(game: BoardGame): BubbleFacts {
  const scored = game.state !== 'pre'
  const status = game.state === 'post'
    ? (/final/i.test(game.detail) ? game.detail.replace(/^final/i, 'Final') : 'Final')
    : game.state === 'in'
      ? game.situation?.clock && !game.detail.includes(game.situation.clock) ? `${game.detail} ${game.situation.clock}` : game.detail
      : kickoffShort(game.kickoff) || game.detail
  return {
    away: game.away.abbr,
    home: game.home.abbr,
    middle: scored ? `${game.away.score ?? '–'}–${game.home.score ?? '–'}` : 'at',
    spread: spreadSlot(game),
    status,
    live: game.state === 'in',
  }
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** White text contrast over a team color under a black scrim of the given alpha. */
export function whiteContrast(hex: string, scrim: number): number {
  const c = rgb(hex) ?? [125, 138, 155]
  const k = 1 - Math.max(0, Math.min(1, scrim))
  const mixed: [number, number, number] = [c[0] * k, c[1] * k, c[2] * k]
  return 1.05 / (luminance(mixed) + 0.05)
}

/** Smallest black scrim (in 0.05 steps, at least 0.2) that gives white text 4.5:1 on both team colors. */
export function scrimFor(colors: string[]): number {
  for (let a = 0.2; a <= 0.9001; a += 0.05) {
    if (colors.every((hex) => whiteContrast(hex, a) >= 4.5)) return Math.round(a * 100) / 100
  }
  return 0.9
}
