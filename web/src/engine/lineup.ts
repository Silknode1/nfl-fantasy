import type { FantasyData, Player, Pos } from '../types'

export const POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE']
export const STARTERS: Record<Pos, number> = { QB: 1, RB: 2, WR: 2, TE: 1 }
export const FLEX = 2
export const ACTIVE_ROSTER = 15 // 8 starters + 7 bench; the 2 IR slots sit outside this
export const PLAYOFF_WEIGHT = 1.5 // win-the-title setting: playoff weeks count 1.5x

export interface Slotted {
  slot: string
  player: Player
  pts: number
}

export interface Lineup {
  starters: Slotted[]
  bench: Player[]
  points: number
  sd: number
}

const projAt = (p: Player, week: number) => p.proj[String(week)] ?? 0

/** Best legal lineup for one week. Greedy is optimal for QB/RB/WR/TE + RB/WR/TE flex. */
export function bestLineup(roster: Player[], week: number): Lineup {
  const pool = roster.filter((p) => p.slot !== 'IR' || week > 0)
  const byPos: Record<Pos, Player[]> = { QB: [], RB: [], WR: [], TE: [] }
  for (const p of pool) byPos[p.pos].push(p)
  for (const pos of POSITIONS) byPos[pos].sort((a, b) => projAt(b, week) - projAt(a, week))
  const starters: Slotted[] = []
  const used = new Set<string>()
  for (const pos of POSITIONS) {
    byPos[pos].slice(0, STARTERS[pos]).forEach((p) => {
      starters.push({ slot: pos, player: p, pts: projAt(p, week) })
      used.add(p.id)
    })
  }
  const flexPool = [...byPos.RB, ...byPos.WR, ...byPos.TE]
    .filter((p) => !used.has(p.id))
    .sort((a, b) => projAt(b, week) - projAt(a, week))
  flexPool.slice(0, FLEX).forEach((p) => {
    starters.push({ slot: 'FLEX', player: p, pts: projAt(p, week) })
    used.add(p.id)
  })
  const points = starters.reduce((s, x) => s + x.pts, 0)
  // Player weekly sds plus a team-level noise floor.
  const sd = Math.sqrt(starters.reduce((s, x) => s + (x.player.sd * (x.pts > 0 ? 1 : 0)) ** 2, 0) + 100)
  return { starters, bench: pool.filter((p) => !used.has(p.id)), points, sd }
}

export interface TeamOutlook {
  weekly: Record<number, { points: number; sd: number }>
  regular: number // mean starting points per week, rest of regular season
  playoff: number // mean starting points per week, playoff weeks
  weighted: number // the number trades and waivers are judged on
}

/** Weekly best-lineup points from `from` on; the summary numbers only count weeks from `valueFrom`. */
export function outlook(roster: Player[], from: number, regularWeeks: number, lastWeek: number, valueFrom = from): TeamOutlook {
  const weekly: TeamOutlook['weekly'] = {}
  let reg = 0
  let regN = 0
  let po = 0
  let poN = 0
  for (let w = from; w <= lastWeek; w++) {
    const l = bestLineup(roster, w)
    weekly[w] = { points: l.points, sd: l.sd }
    if (w < valueFrom) continue
    if (w <= regularWeeks) {
      reg += l.points
      regN++
    } else {
      po += l.points
      poN++
    }
  }
  const regular = regN ? reg / regN : 0
  const playoff = poN ? po / poN : 0
  const weighted = (reg + PLAYOFF_WEIGHT * po) / (regN + PLAYOFF_WEIGHT * poN || 1)
  return { weekly, regular, playoff, weighted }
}

/** A player's weighted points per week from the next week on: the value unit used everywhere. */
export function playerValue(p: Player, from: number, regularWeeks: number, lastWeek: number): number {
  let s = 0
  let n = 0
  for (let w = from; w <= lastWeek; w++) {
    const wt = w > regularWeeks ? PLAYOFF_WEIGHT : 1
    s += wt * projAt(p, w)
    n += wt
  }
  return n ? s / n : 0
}

/** Team strength at each position: summed weighted value of the starters that position needs. */
export function positionStrength(roster: Player[], from: number, d: FantasyData): Record<Pos | 'FLEX' | 'BENCH', number> {
  const val = (p: Player) => playerValue(p, from, d.meta.regularWeeks, d.meta.lastWeek)
  const out = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, BENCH: 0 }
  const used = new Set<string>()
  for (const pos of POSITIONS) {
    const top = roster.filter((p) => p.pos === pos).sort((a, b) => val(b) - val(a)).slice(0, STARTERS[pos])
    top.forEach((p) => used.add(p.id))
    out[pos] = top.reduce((s, p) => s + val(p), 0)
  }
  const rest = roster.filter((p) => !used.has(p.id) && p.pos !== 'QB').sort((a, b) => val(b) - val(a))
  out.FLEX = rest.slice(0, FLEX).reduce((s, p) => s + val(p), 0)
  out.BENCH = rest.slice(FLEX, FLEX + 4).reduce((s, p) => s + val(p), 0)
  return out
}

export function rosters(d: FantasyData): Map<number, Player[]> {
  const m = new Map<number, Player[]>()
  for (const t of d.teams) m.set(t.id, [])
  for (const p of d.players) if (p.teamId && m.has(p.teamId)) m.get(p.teamId)!.push(p)
  return m
}

export type Ranks = Record<number, Record<Pos | 'FLEX' | 'BENCH' | 'OVERALL', { value: number; rank: number }>>

export function leagueRanks(d: FantasyData, rs: Map<number, Player[]>): Ranks {
  const from = d.meta.week + 1
  const strengths = [...rs.entries()].map(([id, r]) => ({ id, s: positionStrength(r, from, d), o: outlook(r, from, d.meta.regularWeeks, d.meta.lastWeek).weighted }))
  const out: Ranks = {}
  for (const x of strengths) out[x.id] = {} as Ranks[number]
  const keys = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BENCH'] as const
  for (const k of keys) {
    const sorted = [...strengths].sort((a, b) => b.s[k] - a.s[k])
    sorted.forEach((x, i) => (out[x.id][k] = { value: x.s[k], rank: i + 1 }))
  }
  const ov = [...strengths].sort((a, b) => b.o - a.o)
  ov.forEach((x, i) => (out[x.id].OVERALL = { value: x.o, rank: i + 1 }))
  return out
}
