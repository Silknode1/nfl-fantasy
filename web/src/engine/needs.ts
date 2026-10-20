import type { FantasyData, Player, Pos } from '../types'
import { bestLineup, FLEX, outlook, PLAYOFF_WEIGHT, playerValue, POSITIONS, rosters, STARTERS } from './lineup'

export type NeedSlot = Pos | 'FLEX'
export type NeedReason = 'injury' | 'bye' | 'hole'

export interface LineupNeed {
  slot: NeedSlot
  /** Starter who would leave this slot. */
  leaves: Player
  /** Weighted pts/week, the same unit as the trade score. Playoff weeks count 1.5×. */
  gap: number
  reason: NeedReason
}

const HURT = new Set(['QUESTIONABLE', 'DOUBTFUL', 'OUT', 'INJURY_RESERVE'])

export function qbIsShort(needs: LineupNeed[]): boolean {
  return needs.some((n) => n.slot === 'QB' && n.gap > 0)
}

interface Slotted {
  slot: NeedSlot
  player: Player
}

function byScore(roster: Player[], score: (p: Player) => number): Slotted[] {
  const byPos: Record<Pos, Player[]> = { QB: [], RB: [], WR: [], TE: [] }
  for (const p of roster) if (p.slot !== 'IR') byPos[p.pos].push(p)
  for (const pos of POSITIONS) byPos[pos].sort((a, b) => score(b) - score(a))
  const starters: Slotted[] = []
  const used = new Set<string>()
  for (const pos of POSITIONS) {
    for (const p of byPos[pos].slice(0, STARTERS[pos])) {
      starters.push({ slot: pos, player: p })
      used.add(p.id)
    }
  }
  const flex = [...byPos.RB, ...byPos.WR, ...byPos.TE].filter((p) => !used.has(p.id))
  flex.sort((a, b) => score(b) - score(a))
  for (const p of flex.slice(0, FLEX)) starters.push({ slot: 'FLEX', player: p })
  return starters
}

function weightTotal(from: number, regular: number, last: number): number {
  let total = 0
  for (let w = from; w <= last; w++) total += w > regular ? PLAYOFF_WEIGHT : 1
  return total || 1
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Lineup gaps for the user's team: an injured or doubtful starter, a bye inside the
 * value window, and a starter below the league median at that slot.
 * Every gap is weighted points per week. Nothing here is typed in by hand.
 */
export function lineupNeeds(d: FantasyData): LineupNeed[] {
  const from = d.meta.week + 1
  const regular = d.meta.regularWeeks
  const last = d.meta.lastWeek
  const rs = rosters(d)
  const mine = rs.get(d.meta.myTeamId) ?? []
  const value = (p: Player) => playerValue(p, from, regular, last)
  const mineLine = byScore(mine, value)
  const needs: LineupNeed[] = []
  const totalW = weightTotal(from, regular, last)

  for (const { slot, player } of mineLine) {
    const hurt = (!!player.inj && HURT.has(player.inj)) || (player.playP != null && player.playP < 0.75)
    if (hurt) {
      const without = mine.filter((p) => p.id !== player.id)
      const gap = outlook(mine, from, regular, last).weighted - outlook(without, from, regular, last).weighted
      if (gap >= 0.25) needs.push({ slot, leaves: player, gap, reason: 'injury' })
    }
    if (player.bye != null && player.bye >= from && player.bye <= last) {
      const week = player.bye
      const samples: number[] = []
      for (let w = from; w <= last; w++) {
        if (w === week) continue
        const v = player.projIf?.[String(w)] ?? player.proj[String(w)] ?? 0
        if (v > 0) samples.push(v)
      }
      if (samples.length) {
        const typical = samples.reduce((a, b) => a + b, 0) / samples.length
        const filled = mine.map((p) => (p.id === player.id ? { ...p, proj: { ...p.proj, [String(week)]: typical } } : p))
        const weekDelta = bestLineup(filled, week).points - bestLineup(mine, week).points
        const weight = week > regular ? PLAYOFF_WEIGHT : 1
        const gap = (weekDelta * weight) / totalW
        if (gap >= 0.15) needs.push({ slot, leaves: player, gap, reason: 'bye' })
      }
    }
  }

  const pools: Record<NeedSlot, number[]> = { QB: [], RB: [], WR: [], TE: [], FLEX: [] }
  for (const roster of rs.values()) {
    for (const starter of byScore(roster, value)) pools[starter.slot].push(value(starter.player))
  }
  for (const starter of mineLine) {
    const gap = median(pools[starter.slot]) - value(starter.player)
    if (gap >= 1) needs.push({ slot: starter.slot, leaves: starter.player, gap, reason: 'hole' })
  }

  return needs.sort((a, b) => b.gap - a.gap || a.slot.localeCompare(b.slot))
}
