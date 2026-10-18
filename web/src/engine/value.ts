import type { Player, Pos } from '../types'
import { playerValue } from './lineup'

/**
 * Last startable player in this 12-team league (1 QB, 2 RB, 2 WR, 1 TE, 2 flex).
 * QB12 and TE12 are one starter per team. RB30 and WR30 cover two starters plus a
 * share of the flex spots. That depth is the scarcity: the same raw points are worth
 * more where the replacement player scores less. There is no extra position multiplier.
 */
export const REPLACEMENT_RANK: Record<Pos, number> = { QB: 12, RB: 30, WR: 30, TE: 12 }

export interface TradeValue {
  /** Weighted pts/week from the next week through the last week. Playoff weeks count 1.5×, same as playerValue. */
  production: number
  /** Production of the replacement-level player at this position. */
  replacement: number
  /** production − replacement. Negative means a replacement player is projected to score more. */
  surplus: number
}

/** Production of the Nth player at the position, or the last player when the pool is shorter. */
export function replacementLevel(players: Player[], pos: Pos, from: number, regularWeeks: number, lastWeek: number): number {
  const vals = players
    .filter((p) => p.pos === pos)
    .map((p) => playerValue(p, from, regularWeeks, lastWeek))
    .sort((a, b) => b - a)
  if (!vals.length) return 0
  const idx = Math.min(REPLACEMENT_RANK[pos], vals.length) - 1
  return vals[idx]
}

export function tradeValue(p: Player, players: Player[], from: number, regularWeeks: number, lastWeek: number): TradeValue {
  const production = playerValue(p, from, regularWeeks, lastWeek)
  const replacement = replacementLevel(players, p.pos, from, regularWeeks, lastWeek)
  return { production, replacement, surplus: production - replacement }
}

/** One pass over the pool so a screen can look up every player. */
export function tradeTable(players: Player[], from: number, regularWeeks: number, lastWeek: number): Map<string, TradeValue> {
  const repl = new Map<Pos, number>()
  for (const pos of ['QB', 'RB', 'WR', 'TE'] as Pos[]) {
    repl.set(pos, replacementLevel(players, pos, from, regularWeeks, lastWeek))
  }
  return new Map(
    players.map((p) => {
      const production = playerValue(p, from, regularWeeks, lastWeek)
      const replacement = repl.get(p.pos) ?? 0
      return [p.id, { production, replacement, surplus: production - replacement }] as const
    }),
  )
}
