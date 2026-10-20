import type { FantasyData, Player } from '../types'
import { outlook, type TeamOutlook } from './lineup'

/** Seeded RNG so a trade's effect is measured on the same simulated seasons as the baseline. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Noise {
  sims: number
  weeks: number[]
  teamIds: number[]
  z: Float64Array // [sim][week][team] weekly luck
  strength: Float64Array // [sim][team] season-long projection error
}

/** Projections are wrong by a few points a week for a whole season, not just week to week. */
export const STRENGTH_SD = 5

export function makeNoise(teamIds: number[], weeks: number[], sims = 3000, seed = 20261011): Noise {
  const rnd = mulberry32(seed)
  const z = new Float64Array(sims * weeks.length * teamIds.length)
  for (let i = 0; i < z.length; i += 2) {
    // Box-Muller, two normals per pair of uniforms
    const u = Math.max(rnd(), 1e-12)
    const v = rnd()
    const r = Math.sqrt(-2 * Math.log(u))
    z[i] = r * Math.cos(2 * Math.PI * v)
    if (i + 1 < z.length) z[i + 1] = r * Math.sin(2 * Math.PI * v)
  }
  const strength = new Float64Array(sims * teamIds.length)
  for (let i = 0; i < strength.length; i++) {
    const u = Math.max(rnd(), 1e-12)
    strength[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
  }
  return { sims, weeks, teamIds, z, strength }
}

/** Regular-season games the sim plays: this week through the last regular week. */
export function remainingGames(d: FantasyData) {
  return d.games.filter((g) => g.week >= d.meta.week && g.week <= d.meta.regularWeeks)
}

export interface SimResult {
  playoff: Record<number, number>
  bye: Record<number, number>
  title: Record<number, number>
  avgWins: Record<number, number>
  seedDist: Record<number, number[]>
}

/**
 * Simulate the rest of the season. Each team starts from its current wins (a tie is half
 * a win) and points for. Finished games are not re-scored, and a winner already stored on
 * a remaining game is not read. Remaining games, this week through the last regular week,
 * are scored from lineup projections plus noise. Seeding is wins then points scored.
 * The top `playoffTeams` make it, seeds 1-2 get byes, then the playoff weeks.
 */
export function simulate(d: FantasyData, rosters: Map<number, Player[]>, noise: Noise, outlooks?: Map<number, TeamOutlook>): SimResult {
  const { week, regularWeeks, lastWeek, playoffTeams } = d.meta
  const ids = noise.teamIds
  const tIndex = new Map(ids.map((id, i) => [id, i]))
  const wIndex = new Map(noise.weeks.map((w, i) => [w, i]))
  const ol = outlooks ?? new Map(ids.map((id) => [id, outlook(rosters.get(id) ?? [], week, regularWeeks, lastWeek)]))
  const base = new Map(d.teams.map((t) => [t.id, { w: t.wins + 0.5 * t.ties, pf: t.pf }]))
  const games = remainingGames(d)
  const nT = ids.length
  const nW = noise.weeks.length
  const res: SimResult = { playoff: {}, bye: {}, title: {}, avgWins: {}, seedDist: {} }
  for (const id of ids) {
    res.playoff[id] = 0
    res.bye[id] = 0
    res.title[id] = 0
    res.avgWins[id] = 0
    res.seedDist[id] = new Array(playoffTeams).fill(0)
  }
  const score = (sim: number, id: number, w: number) => {
    const o = ol.get(id)!.weekly[w]
    const ti = tIndex.get(id)!
    const zi = sim * nW * nT + wIndex.get(w)! * nT + ti
    return o.points + STRENGTH_SD * noise.strength[sim * nT + ti] + o.sd * noise.z[zi]
  }
  for (let s = 0; s < noise.sims; s++) {
    const wins = new Map<number, number>()
    const pf = new Map<number, number>()
    for (const id of ids) {
      wins.set(id, base.get(id)!.w)
      pf.set(id, base.get(id)!.pf)
    }
    for (const g of games) {
      const h = score(s, g.home, g.week)
      const a = score(s, g.away, g.week)
      pf.set(g.home, pf.get(g.home)! + h)
      pf.set(g.away, pf.get(g.away)! + a)
      if (h >= a) wins.set(g.home, wins.get(g.home)! + 1)
      else wins.set(g.away, wins.get(g.away)! + 1)
    }
    const seeds = [...ids].sort((x, y) => wins.get(y)! - wins.get(x)! || pf.get(y)! - pf.get(x)!).slice(0, playoffTeams)
    seeds.forEach((id, i) => {
      res.playoff[id]++
      res.seedDist[id][i]++
      if (i < 2) res.bye[id]++
    })
    for (const id of ids) res.avgWins[id] += wins.get(id)!
    // Week 15: 3v6, 4v5. Week 16: 1 vs lowest survivor, 2 vs the other. Week 17: final.
    const play = (x: number, y: number, w: number) => (score(s, x, w) >= score(s, y, w) ? x : y)
    const [s1, s2, s3, s4, s5, s6] = seeds
    const wA = play(s3, s6, regularWeeks + 1)
    const wB = play(s4, s5, regularWeeks + 1)
    const lowSeed = seeds.indexOf(wA) > seeds.indexOf(wB) ? wA : wB
    const other = lowSeed === wA ? wB : wA
    const f1 = play(s1, lowSeed, regularWeeks + 2)
    const f2 = play(s2, other, regularWeeks + 2)
    const champ = play(f1, f2, lastWeek)
    res.title[champ]++
  }
  for (const id of ids) {
    res.playoff[id] /= noise.sims
    res.bye[id] /= noise.sims
    res.title[id] /= noise.sims
    res.avgWins[id] /= noise.sims
    res.seedDist[id] = res.seedDist[id].map((c) => c / noise.sims)
  }
  return res
}
