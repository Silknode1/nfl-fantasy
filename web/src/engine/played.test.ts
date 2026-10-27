import { describe, expect, test } from 'vitest'
import type { FantasyData, Player, Pos } from '../types'
import { weekRange } from '../components/RangeChart'
import { separatePlayedProjections } from './played'

function player(over: Partial<Player> & { id: string; pos: Pos }): Player {
  return {
    name: over.id,
    nfl: 'BUF',
    teamId: 1,
    status: 'ONTEAM',
    slot: 'BE',
    inj: 'ACTIVE',
    injNote: null,
    bye: 12,
    photo: '',
    actual: {},
    gp: 4,
    ppg: 10,
    espnWeek: 12,
    espnSeason: 170,
    own: 0,
    ownChg: 0,
    started: 0,
    usage: null,
    adds: 0,
    drops: 0,
    jev: null,
    rate: 10,
    rateParts: { espn: 10, season: 10, trend: 1, jev: 1, week: 11.2, k: 4 },
    proj: { '6': 22, '7': 10.8 },
    projIf: { '6': 22, '7': 11.25 },
    playP: null,
    sd: 4,
    ros: 10.8,
    playoffs: 0,
    ourRank: 1,
    espnRank: 1,
    tradeLocked: false,
    locked: true,
    ...over,
  }
}

function data(players: Player[]): FantasyData {
  return {
    meta: {
      generatedAt: '2026-10-26T00:00:00Z',
      season: 2026,
      week: 6,
      regularWeeks: 14,
      lastWeek: 17,
      playoffTeams: 6,
      leagueName: 'Synthetic',
      faabBudget: 100,
      tradeDeadline: '2026-12-04',
      myTeamId: 1,
      scoring: 'Half PPR',
      sources: [],
      sleeperPulledAt: null,
    },
    teams: [],
    games: [],
    defense: { MIA: { RB: 1.2 } },
    players,
    nflOpp: { BUF: { '6': 'MIA', '7': 'MIA' } },
  }
}

describe('played week stays separate from the projection', () => {
  test('a copied actual is replaced by the pregame projection', () => {
    const runner = player({ id: '1', name: 'Runner', pos: 'RB', actual: { '6': 22 } })
    separatePlayedProjections(data([runner]))
    // ESPN priced the week, so the 1.2 opponent factor is not applied.
    // RB prior 4: (4*10 + 4*11.2) / 8 = 10.6, times the 0.96 play chance.
    expect(runner.proj['6']).toBeCloseTo(10.18, 2)
    expect(runner.projIf?.['6']).toBeCloseTo(10.6, 2)
    expect(runner.actual['6']).toBe(22)
    expect(runner.proj['7']).toBe(10.8)
  })

  test('a negative week and a negative spread are floored at 0', () => {
    const backup = player({
      id: '9',
      pos: 'QB',
      nfl: 'MIA',
      locked: false,
      playP: 0.97,
      sd: -0.16,
      ppg: -0.25,
      espnWeek: 0,
      rate: -0.07,
      rateParts: { espn: 0, season: -0.25, trend: 1, jev: 1, week: 0, k: 10 },
      actual: {},
      proj: { '8': -0.06, '9': -0.07 },
      projIf: { '8': -0.06, '9': -0.07 },
    })
    const d = data([backup])
    d.meta.week = 7
    separatePlayedProjections(d)
    expect(backup.proj['8']).toBe(0)
    expect(backup.proj['9']).toBe(0)
    expect(backup.sd).toBe(0)
    expect(backup.rate).toBe(-0.07)
  })

  test('floor stays at or under the expected score', () => {
    const p = player({ id: '2', pos: 'WR', sd: -2, proj: { '6': 10 }, locked: false, playP: 0.97 })
    const range = weekRange(p, 6)
    expect(range).not.toBeNull()
    expect(range!.floor).toBeLessThanOrEqual(range!.exp)
    expect(range!.exp).toBeLessThanOrEqual(range!.ceil)
    expect(range!.floor).toBeGreaterThanOrEqual(0)
  })
})
