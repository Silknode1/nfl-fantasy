import type { Player, Pos } from '../types'
import { bestLineup, type Ranks } from './lineup'
import type { TradeLab } from './trade'

export interface WaiverPick {
  player: Player
  /** Weighted pts/week added to the best lineup at this slot. Playoff weeks count 1.5×. */
  gain: number
  /** Starter who leaves that slot. Null when the add never enters the lineup. */
  leaves: Player | null
  slot: string | null
  /** Rank at his position by lineup delta. 1 is the largest delta. */
  posRank: number
  value: number // the player's own weighted points per week
  hype: number // 0-1, Sleeper adds plus ESPN ownership jump
  trend: number // 0-1, rising role
  need: number // 0-1, how weak my team is at his position
  /** Arbitrary blend. It does not set the board order. */
  score: number
  drop: Player | null
  bid: number
  why: string[]
  cuffFor?: string
}

export interface SlotDelta {
  delta: number
  leaves: Player | null
  slot: string | null
}

/**
 * Change in weighted starting points if `add` joins the roster.
 * The comparison is the best lineup before and after. The player who leaves is the
 * starter displaced most often, which is the same slot, not the lowest raw score at any position.
 */
export function slotLineupDelta(lab: TradeLab, roster: Player[], add: Player): SlotDelta {
  const beforeRoster = roster.filter((p) => p.id !== add.id)
  const afterRoster = [...beforeRoster, { ...add, teamId: lab.myId, slot: 'BE' }]
  const delta = lab.outlookOf(afterRoster).weighted - lab.outlookOf(beforeRoster).weighted
  if (delta <= 0.05) return { delta, leaves: null, slot: null }
  const counts = new Map<string, { player: Player; slot: string; n: number }>()
  for (let w = lab.from; w <= lab.d.meta.lastWeek; w++) {
    const before = bestLineup(beforeRoster, w)
    const afterIds = new Set(bestLineup(afterRoster, w).starters.map((s) => s.player.id))
    for (const s of before.starters) {
      if (afterIds.has(s.player.id)) continue
      const cur = counts.get(s.player.id) ?? { player: s.player, slot: s.slot, n: 0 }
      cur.n += 1
      counts.set(s.player.id, cur)
    }
  }
  let leaves: { player: Player; slot: string; n: number } | null = null
  for (const row of counts.values()) if (!leaves || row.n > leaves.n) leaves = row
  return { delta, leaves: leaves?.player ?? null, slot: leaves?.slot ?? null }
}

export type WaiverSort = 'delta' | 'position' | 'hype' | 'fit' | 'role'

const POS_ORDER: Record<Pos, number> = { QB: 0, RB: 1, WR: 2, TE: 3 }

/** One board. Position order is within-position rank, then QB / RB / WR / TE. */
export function sortWaivers(picks: WaiverPick[], key: WaiverSort): WaiverPick[] {
  const copy = [...picks]
  if (key === 'position') copy.sort((a, b) => a.posRank - b.posRank || POS_ORDER[a.player.pos] - POS_ORDER[b.player.pos] || b.gain - a.gain)
  else if (key === 'hype') copy.sort((a, b) => b.hype - a.hype || b.gain - a.gain)
  else if (key === 'role') copy.sort((a, b) => b.trend - a.trend || b.gain - a.gain)
  else copy.sort((a, b) => b.gain - a.gain || a.posRank - b.posRank)
  return copy
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/**
 * Rank free agents for my team.
 * Order is the same-slot lineup delta. The 40/35/15/10 blend is still computed from real inputs
 * (lineup fit, hype, role trend, the player's own points) but those weights are arbitrary and do not sort the board.
 * FAAB is a share of the remaining budget by that delta rank. The shares are arbitrary.
 */
export function rankWaivers(lab: TradeLab, ranks: Ranks, faabLeft: number): WaiverPick[] {
  const me = lab.myId
  const mine = lab.rosters.get(me)!
  const starting = new Set(bestLineup(mine, lab.from).starters.map((s) => s.player.id))
  // A roster spot comes off the bench. The cut is not the points comparison.
  const droppable = lab.active(mine).filter((p) => p.slot !== 'IR' && p.inj !== 'INJURY_RESERVE').sort((a, b) => lab.v(a) - lab.v(b))
  const bench = droppable.filter((p) => !starting.has(p.id))
  const maxAdds = Math.max(1, ...lab.freeAgents.map((p) => p.adds))
  const picks: WaiverPick[] = []
  for (const p of lab.freeAgents.slice(0, 160)) {
    if (p.inj === 'INJURY_RESERVE' && lab.v(p) < 3) continue
    const slot = slotLineupDelta(lab, mine, p)
    const gain = slot.delta
    const drop = (bench.find((x) => x.id !== p.id) ?? droppable.find((x) => x.id !== p.id)) ?? null
    const hype = clamp01(0.75 * (Math.log1p(p.adds) / Math.log1p(maxAdds)) + 0.25 * clamp01(p.ownChg / 10))
    const u = p.usage
    const trendRaw = u ? (p.pos === 'RB' ? (u.oppTrend ?? 0) / Math.max(u.oppPg ?? 1, 4) : (u.tgtShareTrend ?? 0) * 4) + (u.snapTrend ?? 0) * 2 : 0
    const trend = clamp01(0.5 + trendRaw)
    const myRank = ranks[me]?.[p.pos as Pos]?.rank ?? 6
    const need = clamp01((myRank - 1) / 11)
    const value = lab.v(p)
    const cuffFor = p.pos === 'RB' ? mine.find((m) => m.pos === 'RB' && m.nfl === p.nfl && lab.v(m) > 8) : undefined
    const gainScore = clamp01(gain / 3)
    const score = 0.4 * gainScore + 0.35 * hype + 0.15 * trend + 0.1 * clamp01(value / 14) + (cuffFor ? 0.08 : 0)
    const why: string[] = []
    if (gain > 0.05 && slot.leaves) why.push(`+${gain.toFixed(1)} pts/week at ${slot.slot} over ${slot.leaves.name}`)
    else if (gain > 0.05) why.push(`+${gain.toFixed(1)} pts/week in the best lineup`)
    if (p.adds > 1000) why.push(`${p.adds.toLocaleString()} Sleeper adds in 24h`)
    if (p.ownChg >= 3) why.push(`ESPN rostered up ${p.ownChg.toFixed(1)} points`)
    if (u?.tgtShareTrend && u.tgtShareTrend > 0.04) why.push(`target share up ${(u.tgtShareTrend * 100).toFixed(0)} pts lately`)
    if (u?.snapTrend && u.snapTrend > 0.08) why.push(`snap share up ${(u.snapTrend * 100).toFixed(0)} pts lately`)
    if (p.jev?.role === 'expands') why.push('news says his role is growing')
    if (cuffFor) why.push(`handcuff for your ${cuffFor.name}`)
    if (need > 0.5) why.push(`your ${p.pos} group ranks ${myRank} of 12`)
    picks.push({
      player: p, gain, leaves: slot.leaves, slot: slot.slot, posRank: 1, value, hype, trend, need, score, drop, bid: 0, why, cuffFor: cuffFor?.name,
    })
  }
  for (const pos of ['QB', 'RB', 'WR', 'TE'] as Pos[]) {
    picks.filter((w) => w.player.pos === pos).sort((a, b) => b.gain - a.gain).forEach((w, i) => { w.posRank = i + 1 })
  }
  picks.sort((a, b) => b.gain - a.gain || a.posRank - b.posRank)
  picks.forEach((w, i) => {
    const share = i === 0 ? 0.22 : i < 3 ? 0.12 : i < 6 ? 0.06 : i < 10 ? 0.03 : 0.01
    w.bid = Math.max(1, Math.round(faabLeft * share))
  })
  return picks
}
