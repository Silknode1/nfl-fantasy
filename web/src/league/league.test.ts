import { describe, expect, test } from 'vitest'
import type { FantasyData, Game, Team } from '../types'
import type { TeamOutlook } from '../engine/lineup'
import { makeNoise, remainingGames, simulate } from '../engine/sim'
import { seedsNow, standingsOrder, winPct } from './standings'
import { DARK_INK_FROM, rankCell, rankIntensity, rankMix } from './shade'
import { simDrivers } from './drivers'

function team(id: number, wins: number, losses: number, pf: number, ties = 0): Team {
  return { id, name: `T${id}`, abbrev: `T${id}`, wins, losses, ties, pf, pa: 0, faabLeft: 0, waiverRank: id, espnPlayoffPct: null, trades: 0, acquisitions: 0 }
}

describe('standings order', () => {
  test('win % first, then points for, then id', () => {
    const teams = [team(1, 3, 2, 500), team(2, 4, 1, 400), team(3, 3, 2, 520), team(4, 3, 2, 520), team(5, 0, 5, 700)]
    expect(standingsOrder(teams).map((t) => t.id)).toEqual([2, 3, 4, 1, 5])
  })

  test('a tie counts half a win', () => {
    const a = team(1, 3, 1, 400, 1)
    const b = team(2, 3, 2, 900)
    expect(winPct(a)).toBeCloseTo(0.7)
    expect(standingsOrder([b, a]).map((t) => t.id)).toEqual([1, 2])
  })

  test('seeds follow the same order and do not mutate the input', () => {
    const teams = [team(1, 1, 4, 300), team(2, 5, 0, 300)]
    expect([...seedsNow(teams).entries()]).toEqual([[2, 1], [1, 2]])
    expect(teams.map((t) => t.id)).toEqual([1, 2])
  })
})

describe('rank shading', () => {
  test('rank 1 is brighter than rank 12', () => {
    expect(rankIntensity(1, 12)).toBe(1)
    expect(rankIntensity(12, 12)).toBe(0)
    expect(rankMix(1, 12)).toBeGreaterThan(rankMix(12, 12))
    for (let r = 1; r < 12; r++) expect(rankMix(r, 12)).toBeGreaterThanOrEqual(rankMix(r + 1, 12))
  })

  test('bright cells switch to dark ink, dim cells keep theme text', () => {
    expect(rankCell(1, 12).dark).toBe(true)
    expect(rankCell(12, 12).dark).toBe(false)
    expect(rankCell(1, 12).background).toContain(`var(--up) ${rankMix(1, 12)}%`)
    expect(rankMix(1, 12)).toBeGreaterThanOrEqual(DARK_INK_FROM)
  })
})

function flatOutlook(byWeek: Record<number, number>, sd = 15): TeamOutlook {
  const weekly: TeamOutlook['weekly'] = {}
  for (const [w, p] of Object.entries(byWeek)) weekly[Number(w)] = { points: p, sd }
  return { weekly, regular: 0, playoff: 0, weighted: 0 }
}

function league(): { d: FantasyData; outlooks: Map<number, TeamOutlook> } {
  const ids = [1, 2, 3, 4, 5, 6]
  const games: Game[] = [
    { week: 5, home: 1, away: 2, winner: 'HOME', homePts: 100, awayPts: 90 }, // played, outside the window
    { week: 6, home: 1, away: 2, winner: 'UNDECIDED' },
    { week: 6, home: 3, away: 4, winner: 'UNDECIDED' },
    { week: 6, home: 5, away: 6, winner: 'UNDECIDED' },
    { week: 7, home: 1, away: 3, winner: 'UNDECIDED' },
    { week: 7, home: 2, away: 5, winner: 'UNDECIDED' },
    { week: 7, home: 4, away: 6, winner: 'UNDECIDED' },
    { week: 9, home: 1, away: 6, winner: 'UNDECIDED' }, // after regularWeeks, the sim never plays it
  ]
  const d = {
    meta: { week: 6, regularWeeks: 7, lastWeek: 10, playoffTeams: 6, myTeamId: 1 },
    teams: ids.map((id) => team(id, 2, 3, 400 + id)),
    games,
    players: [],
  } as unknown as FantasyData
  const pts: Record<number, number[]> = {
    1: [120, 110, 130, 140, 150],
    2: [100, 90, 95, 95, 95],
    3: [105, 115, 99, 99, 99],
    4: [80, 85, 88, 88, 88],
    5: [95, 100, 101, 101, 101],
    6: [70, 75, 77, 77, 77],
  }
  const outlooks = new Map(ids.map((id) => [id, flatOutlook(Object.fromEntries(pts[id]!.map((p, i) => [6 + i, p])))]))
  return { d, outlooks }
}

describe('sim drivers', () => {
  test('equal the outlook points and opponents in the games the sim plays', () => {
    const { d, outlooks } = league()
    const drivers = simDrivers(d, outlooks)
    const t1 = drivers.get(1)!
    expect(t1.gamesLeft).toBe(2)
    expect(t1.projPerWeek).toBeCloseTo((120 + 110) / 2)
    expect(t1.oppPerWeek).toBeCloseTo((100 + 115) / 2)
    expect(t1.playoffPerWeek).toBeCloseTo((130 + 140 + 150) / 3)
    expect(t1.sdPerWeek).toBeCloseTo(15)
    expect(t1.startWins).toBe(2)
    expect(t1.startPf).toBe(401)
    expect(t1.lockedGames).toBe(1)
    expect(drivers.get(3)!.lockedGames).toBe(0)
    const t4 = drivers.get(4)!
    expect(t4.projPerWeek).toBeCloseTo((80 + 85) / 2)
    expect(t4.oppPerWeek).toBeCloseTo((105 + 75) / 2)
  })

  test('the game list is the one simulate() plays', () => {
    const { d, outlooks } = league()
    expect(remainingGames(d)).toHaveLength(6)
    const noise = makeNoise(d.teams.map((t) => t.id), [6, 7, 8, 9, 10], 20)
    noise.z.fill(0)
    noise.strength.fill(0)
    const sim = simulate(d, new Map(), noise, outlooks)
    const drivers = simDrivers(d, outlooks)
    for (const t of d.teams) {
      const won = remainingGames(d).filter((g) => {
        if (g.home === t.id) return outlooks.get(g.home)!.weekly[g.week]!.points >= outlooks.get(g.away)!.weekly[g.week]!.points
        if (g.away === t.id) return outlooks.get(g.away)!.weekly[g.week]!.points > outlooks.get(g.home)!.weekly[g.week]!.points
        return false
      }).length
      expect(sim.avgWins[t.id]).toBeCloseTo(t.wins + won)
      expect(drivers.get(t.id)!.gamesLeft).toBe(remainingGames(d).filter((g) => g.home === t.id || g.away === t.id).length)
    }
  })
})
