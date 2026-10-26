/**
 * The Games ticker: the week as full-width rows of bubbles.
 * At least 60% of the games stay on screen. Bubbles shrink before a third row is added.
 * Every number on a bubble is copied from the scoreboard. A missing quote is an empty slot.
 */

import { formatLine, type BoardGame } from './normalize'
import { liveFirst, searchView } from './search'

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

/** Gap between bubbles, matching `.ticker-seg`. */
export const TICK_GAP = 8
/** Smallest readable bubble: two abbreviations, a score, and a status line. */
export const TICK_MIN = 156
/** Preferred bubble. Wider desks keep this; tighter desks shrink toward TICK_MIN. */
export const TICK_PREF = 188
/** Share of the week that must be on screen without scrolling. */
export const VISIBLE_SHARE = 0.6
const MAX_ROWS = 5

export interface TickerFit {
  rows: number
  bubble: number
}

/** How many bubbles of `bubble` px fit in `viewport`, including the gap. */
export function bubblesAcross(viewport: number, bubble: number, gap = TICK_GAP): number {
  if (!(viewport > 0) || !(bubble > 0)) return 1
  return Math.max(1, Math.floor((viewport + gap) / (bubble + gap)))
}

/** Games actually on screen when each row shows at most `across` bubbles. */
export function visibleCount(games: number, rows: number, across: number): number {
  if (games <= 0 || rows <= 0 || across <= 0) return 0
  let seen = 0
  const n = Math.min(rows, games)
  for (let i = 0; i < n; i++) {
    const size = Math.floor(games / n) + (i < games % n ? 1 : 0)
    seen += Math.min(size, across)
  }
  return seen
}

/**
 * Rows and bubble width so at least 60% of `games` fit in `viewport`.
 * Keeps the comfortable width when two rows are enough. Shrinks next.
 * Adds a row only when shrinking to TICK_MIN still hides too much.
 */
export function tickerFit(games: number, viewport: number): TickerFit {
  if (games <= 0) return { rows: 0, bubble: TICK_PREF }
  const width = viewport > 0 ? viewport : 1280
  const need = Math.ceil(games * VISIBLE_SHARE - 1e-9)
  const maxRows = Math.min(MAX_ROWS, games)
  for (let rows = 1; rows <= maxRows; rows++) {
    if (visibleCount(games, rows, bubblesAcross(width, TICK_PREF)) >= need) return { rows, bubble: TICK_PREF }
  }
  for (let rows = 1; rows <= maxRows; rows++) {
    let best: number | null = null
    for (let bubble = TICK_PREF; bubble >= TICK_MIN; bubble -= 2) {
      if (visibleCount(games, rows, bubblesAcross(width, bubble)) >= need) {
        best = bubble
        break
      }
    }
    if (best != null) return { rows, bubble: best }
  }
  return { rows: maxRows, bubble: TICK_MIN }
}

/** Row count for a desk. `viewport` defaults to a laptop width until the band is measured. */
export function tickerRowCount(games: number, viewport = 1280): number {
  return tickerFit(games, viewport).rows
}

export interface TickerBand {
  rows: number
  bubble: number
  fullWidth: true
}

/** The band spans the width under the Games nav and keeps 60% of the week in view. */
export function tickerBand(games: number, viewport = 1280): TickerBand {
  const fit = tickerFit(games, viewport)
  return { rows: fit.rows, bubble: fit.bubble, fullWidth: true }
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

/**
 * Auto-scroll a row only when its games overflow the viewport.
 * A row that already fits stays still. Reduced motion always scrolls by hand.
 * The 24px slack ignores the segment's trailing gap so a fitted row does not creep.
 */
export function shouldAnimate(contentWidth: number, viewportWidth: number, reducedMotion: boolean): boolean {
  if (reducedMotion || !(viewportWidth > 0) || !(contentWidth > 0)) return false
  return contentWidth > viewportWidth + 24
}

/** A row holds still while the pointer is over it, or while a press is in progress. */
export function rowHeld(hovering: boolean, pressing: boolean): boolean {
  return hovering || pressing
}

/**
 * The id painted on a bubble. The looping copy carries the same id as the real node,
 * so either press resolves to that game. An unknown id selects nothing.
 */
export function tickerTargetFromNode(gameId: string | null | undefined, games: { id: string }[]): string | null {
  const id = (gameId ?? '').trim()
  if (!id || !games.some((game) => game.id === id)) return null
  return id
}

/** Enter and Space activate a bubble. Arrows only move focus along the row. */
export function keyActivatesTicker(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar'
}

/**
 * A ticker press sets the selected game. Search dims bubbles; it does not drop the press,
 * and a loop copy uses the same id as the real bubble.
 */
export function selectedAfterTicker(games: BoardGame[], query: string, activatedId: string | null | undefined): string | null {
  const id = tickerTargetFromNode(activatedId, games)
  if (!id) return null
  return searchView(games, query, id).selectedId
}

function kickoffShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

export function spreadSlot(game: BoardGame): string | null {
  const line = game.quote?.homeSpread ?? game.quote?.home.line ?? null
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

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return [h * 60, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const H = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (H < 60) { r = c; g = x; b = 0 }
  else if (H < 120) { r = x; g = c; b = 0 }
  else if (H < 180) { r = 0; g = c; b = x }
  else if (H < 240) { r = 0; g = x; b = c }
  else if (H < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const hex = (n: number) => Math.round(clamp(n + m, 0, 1) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/** A lighter and a darker stop of the same hue. One team side is never a flat swatch. */
export function siblingStops(hex: string): { light: string; deep: string } {
  const c = rgb(hex) ?? [125, 138, 155]
  const [h, s, l] = toHsl(c[0], c[1], c[2])
  const sat = clamp(Math.max(s, 0.42), 0, 1)
  return {
    light: fromHsl(h, sat, clamp(l + 0.2, 0.28, 0.8)),
    deep: fromHsl(h, clamp(sat + 0.06, 0, 1), clamp(l - 0.24, 0.08, 0.48)),
  }
}

/**
 * One treatment everywhere: each team is a two-stop wash of its own hue,
 * blended on a soft diagonal with a dark mid split, then a contrast scrim.
 */
export function bubbleBackground(away: string, home: string, scrim: number): string {
  const a = siblingStops(away)
  const h = siblingStops(home)
  const k = clamp(scrim, 0, 1)
  return [
    `linear-gradient(rgba(0,0,0,${k}), rgba(0,0,0,${k}))`,
    `linear-gradient(118deg, ${a.light} 0%, ${a.deep} 34%, rgba(7,7,12,0.55) 50%, ${h.deep} 66%, ${h.light} 100%)`,
  ].join(', ')
}
