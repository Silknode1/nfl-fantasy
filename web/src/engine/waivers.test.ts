import { describe, expect, test } from 'vitest'
import raw from '../../public/data/fantasy.json'
import type { FantasyData, Player, Pos } from '../types'
import type { Ranks } from './lineup'
import { TradeLab } from './trade'
import { rankWaivers, slotLineupDelta } from './waivers'

const FROM = 7
const LAST = 17

function flat(points: number, from = FROM, last = LAST): Record<string, number> {
  const proj: Record<string, number> = {}
  for (let w = from; w <= last; w++) proj[String(w)] = points
  return proj
}

function player(over: Partial<Player> & { id: string; pos: Pos; proj: Record<string, number> }): Player {
  return {
    name: over.name ?? over.id,
    nfl: 'BUF',
    teamId: 1,
    status: 'ONTEAM',
    slot: 'BE',
    inj: null,
    injNote: null,
    bye: null,
    photo: '',
    actual: {},
    gp: 4,
    ppg: 10,
    espnWeek: null,
    espnSeason: 170,
    own: 0,
    ownChg: 0,
    started: 0,
    usage: null,
    adds: 0,
    drops: 0,
    jev: null,
    rate: 10,
    rateParts: { espn: 10, season: 10, trend: 1, jev: 1 },
    sd: 4,
    ros: 0,
    playoffs: 0,
    ourRank: 1,
    espnRank: 1,
    tradeLocked: false,
    locked: false,
    ...over,
  }
}

function league(players: Player[], myTeamId = 1): FantasyData {
  const ids = [...new Set(players.map((p) => p.teamId).filter((id): id is number => !!id))]
  return {
    meta: {
      generatedAt: '2026-10-18T00:00:00Z',
      season: 2026,
      week: 6,
      regularWeeks: 14,
      lastWeek: 17,
      playoffTeams: 6,
      leagueName: 'Synthetic',
      faabBudget: 100,
      tradeDeadline: '2026-12-04',
      myTeamId,
      scoring: 'Half PPR',
      sources: [],
      sleeperPulledAt: null,
    },
    teams: ids.map((id) => ({
      id, name: `T${id}`, abbrev: `T${id}`, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0,
      faabLeft: 47, waiverRank: 1, espnPlayoffPct: null, trades: 0, acquisitions: 0,
    })),
    games: [],
    defense: {},
    players,
    nflOpp: {},
  }
}

function ranks(myId: number, qb: number, wr: number): Ranks {
  const cell = (rank: number) => ({ value: 0, rank })
  return {
    [myId]: {
      QB: cell(qb), RB: cell(6), WR: cell(wr), TE: cell(6), FLEX: cell(6), BENCH: cell(6), OVERALL: cell(6),
    },
  }
}

describe('waiver lineup delta', () => {
  test('a QB with higher raw points does not outrank a skill player whose same-position lineup delta is larger', () => {
    // Synthetic roster. The quarterback add scores more raw points, but the wide receiver
    // improves the flex slot by more than the quarterback improves the QB slot.
    const roster = [
      player({ id: 'qb', name: 'Starter QB', pos: 'QB', proj: flat(16) }),
      player({ id: 'rb1', pos: 'RB', proj: flat(14) }),
      player({ id: 'rb2', pos: 'RB', proj: flat(14) }),
      player({ id: 'wr1', pos: 'WR', proj: flat(14) }),
      player({ id: 'wr2', pos: 'WR', proj: flat(14) }),
      player({ id: 'te', pos: 'TE', proj: flat(10) }),
      player({ id: 'flex-rb', pos: 'RB', proj: flat(11) }),
      player({ id: 'flex-wr', name: 'Flex WR', pos: 'WR', proj: flat(8) }),
      player({ id: 'scrub', pos: 'WR', proj: flat(1) }),
    ]
    const qbAdd = player({ id: 'qb-add', name: 'Hot QB', pos: 'QB', teamId: 0, status: 'FREEAGENT', proj: flat(17.2) })
    const wrAdd = player({ id: 'wr-add', name: 'Hot WR', pos: 'WR', teamId: 0, status: 'FREEAGENT', proj: flat(10) })
    const lab = new TradeLab(league([...roster, qbAdd, wrAdd]))
    expect(lab.v(qbAdd)).toBeGreaterThan(lab.v(wrAdd))

    const ordered = rankWaivers(lab, ranks(1, 12, 1), 47)
    const wrAt = ordered.findIndex((w) => w.player.id === 'wr-add')
    const qbAt = ordered.findIndex((w) => w.player.id === 'qb-add')
    expect(wrAt).toBeGreaterThanOrEqual(0)
    expect(qbAt).toBeGreaterThan(wrAt)
    expect(ordered[wrAt]!.gain).toBeCloseTo(2)
    expect(ordered[qbAt]!.gain).toBeCloseTo(1.2)
    expect(ordered[wrAt]!.leaves?.id).toBe('flex-wr')
    expect(ordered[qbAt]!.leaves?.id).toBe('qb')
  })

  test('a same-position drop is the added player minus the player who leaves that slot', () => {
    // The tight end is the lowest raw point total and would be the old position-blind drop.
    // Adding the receiver must be scored against the flex receiver who actually leaves.
    const roster = [
      player({ id: 'qb', pos: 'QB', proj: flat(18) }),
      player({ id: 'rb1', pos: 'RB', proj: flat(14) }),
      player({ id: 'rb2', pos: 'RB', proj: flat(14) }),
      player({ id: 'wr1', pos: 'WR', proj: flat(14) }),
      player({ id: 'wr2', pos: 'WR', proj: flat(14) }),
      player({ id: 'te', name: 'Cheap TE', pos: 'TE', proj: flat(4) }),
      player({ id: 'flex-rb', pos: 'RB', proj: flat(10) }),
      player({ id: 'flex-wr', name: 'Flex WR', pos: 'WR', proj: flat(9) }),
    ]
    const wrAdd = player({ id: 'wr-add', name: 'New WR', pos: 'WR', teamId: 0, status: 'FREEAGENT', proj: flat(16) })
    const lab = new TradeLab(league([...roster, wrAdd]))
    const mine = lab.rosters.get(1)!
    const slot = slotLineupDelta(lab, mine, wrAdd)
    const mean = mine.reduce((sum, p) => sum + lab.v(p), 0) / mine.length
    expect(slot.leaves?.id).toBe('flex-wr')
    expect(slot.delta).toBeCloseTo(lab.v(wrAdd) - lab.v(mine.find((p) => p.id === 'flex-wr')!))
    expect(Math.abs(slot.delta - (lab.v(wrAdd) - mean))).toBeGreaterThan(1)

    const [pick] = rankWaivers(lab, ranks(1, 6, 6), 47).filter((w) => w.player.id === 'wr-add')
    expect(pick!.gain).toBeCloseTo(7)
    expect(pick!.leaves?.id).toBe('flex-wr')
    expect(pick!.drop?.id).not.toBe('flex-wr')
  })

  test('Carney Carnival: a quarterback add is scored against Cousins, not his raw points', () => {
    const d = raw as unknown as FantasyData
    const lab = new TradeLab(d)
    const geno = lab.freeAgents.find((p) => p.name === 'Geno Smith')!
    const cousins = lab.rosters.get(4)!.find((p) => p.name === 'Kirk Cousins')!
    const slot = slotLineupDelta(lab, lab.rosters.get(4)!, geno)
    expect(slot.leaves?.id).toBe(cousins.id)
    expect(slot.slot).toBe('QB')
    expect(slot.delta).toBeGreaterThan(1)
    expect(slot.delta).toBeLessThan(lab.v(geno))
  })
})
