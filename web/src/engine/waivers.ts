import type { Player, Pos } from '../types'
import type { Ranks } from './lineup'
import type { TradeLab } from './trade'

export interface WaiverPick {
  player: Player
  gain: number // my weighted starting points per week if added
  value: number // the player's own weighted points per week
  hype: number // 0-1, Sleeper adds plus ESPN ownership jump
  trend: number // 0-1, rising role
  need: number // 0-1, how weak my team is at his position
  score: number
  drop: Player | null
  bid: number
  why: string[]
  cuffFor?: string
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Rank free agents for my team. Hype-heavy and position-aware, per your standing preference. */
export function rankWaivers(lab: TradeLab, ranks: Ranks, faabLeft: number): WaiverPick[] {
  const me = lab.myId
  const mine = lab.rosters.get(me)!
  const base = lab.baseOutlook.get(me)!.weighted
  // Players listed on IR can move to an IR slot instead of being cut, so they're not drop candidates.
  const droppable = lab.active(mine).filter((p) => p.slot !== 'IR' && p.inj !== 'INJURY_RESERVE').sort((a, b) => lab.v(a) - lab.v(b))
  const maxAdds = Math.max(1, ...lab.freeAgents.map((p) => p.adds))
  const picks: WaiverPick[] = []
  for (const p of lab.freeAgents.slice(0, 160)) {
    if (p.inj === 'INJURY_RESERVE' && lab.v(p) < 3) continue
    const drop = droppable.find((x) => x.id !== p.id) ?? null
    const roster = [...mine.filter((x) => x.id !== drop?.id), { ...p, teamId: me, slot: 'BE' }]
    const gain = lab.outlookOf(roster).weighted - base
    const hype = clamp01(0.75 * (Math.log1p(p.adds) / Math.log1p(maxAdds)) + 0.25 * clamp01(p.ownChg / 10))
    const u = p.usage
    const trendRaw = u ? (p.pos === 'RB' ? (u.oppTrend ?? 0) / Math.max(u.oppPg ?? 1, 4) : (u.tgtShareTrend ?? 0) * 4) + (u.snapTrend ?? 0) * 2 : 0
    const trend = clamp01(0.5 + trendRaw)
    const myRank = ranks[me]?.[p.pos as Pos]?.rank ?? 6
    const need = clamp01((myRank - 1) / 11)
    const value = lab.v(p)
    // Handcuff: a free-agent RB behind one of my starting RBs keeps that job in my hands if he gets hurt.
    const cuffFor = p.pos === 'RB' ? mine.find((m) => m.pos === 'RB' && m.nfl === p.nfl && lab.v(m) > 8) : undefined
    const gainScore = clamp01(gain / 3) * (0.7 + 0.6 * need)
    const score = 0.4 * gainScore + 0.35 * hype + 0.15 * trend + 0.1 * clamp01(value / 14) + (cuffFor ? 0.08 : 0)
    const why: string[] = []
    if (gain > 0.2) why.push(`+${gain.toFixed(1)} starting pts/week for you`)
    if (p.adds > 1000) why.push(`${p.adds.toLocaleString()} Sleeper adds in 24h`)
    if (p.ownChg >= 3) why.push(`ESPN rostered up ${p.ownChg.toFixed(1)} points`)
    if (u?.tgtShareTrend && u.tgtShareTrend > 0.04) why.push(`target share up ${(u.tgtShareTrend * 100).toFixed(0)} pts lately`)
    if (u?.snapTrend && u.snapTrend > 0.08) why.push(`snap share up ${(u.snapTrend * 100).toFixed(0)} pts lately`)
    if (p.jev?.role === 'expands') why.push('news says his role is growing')
    if (cuffFor) why.push(`handcuff for your ${cuffFor.name}`)
    if (need > 0.5) why.push(`your ${p.pos} group ranks ${myRank} of 12`)
    picks.push({ player: p, gain, value, hype, trend, need, score, drop, bid: 0, why, cuffFor: cuffFor?.name })
  }
  picks.sort((a, b) => b.score - a.score)
  // FAAB: top claims get a real share of what's left; the rest are $1-3 dart throws.
  picks.forEach((w, i) => {
    const share = i === 0 ? 0.22 : i < 3 ? 0.12 : i < 6 ? 0.06 : i < 10 ? 0.03 : 0.01
    w.bid = Math.max(1, Math.round(faabLeft * share * (0.6 + 0.8 * w.score)))
  })
  return picks
}
