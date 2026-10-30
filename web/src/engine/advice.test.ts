import { describe, expect, test } from 'vitest'
import type { Player, Pos } from '../types'
import { fitsSlot, weekAdvice } from './advice'

function player(partial: Partial<Player> & { id: string; name: string; pos: Pos; slot: string | null; weekPts: number }): Player {
  return {
    id: partial.id,
    name: partial.name,
    pos: partial.pos,
    nfl: 'ATL',
    teamId: 1,
    status: 'ONTEAM',
    slot: partial.slot,
    inj: null,
    injNote: null,
    bye: null,
    photo: '',
    actual: {},
    gp: 6,
    ppg: partial.weekPts,
    espnWeek: partial.weekPts,
    espnSeason: partial.weekPts * 17,
    own: 0,
    ownChg: 0,
    started: 0,
    usage: null,
    adds: 0,
    drops: 0,
    jev: null,
    rate: partial.weekPts,
    rateParts: { espn: partial.weekPts, season: partial.weekPts, trend: 1, jev: 1 },
    proj: { '8': partial.weekPts },
    sd: 4,
    ros: partial.weekPts,
    playoffs: partial.weekPts,
    ourRank: 1,
    espnRank: null,
    tradeLocked: false,
    locked: partial.locked ?? false,
  }
}

describe('weekAdvice slot legality', () => {
  test('a quarterback is not started over a tight end', () => {
    const roster = [
      player({ id: 'qb1', name: 'Old QB', pos: 'QB', slot: 'QB', weekPts: 10 }),
      player({ id: 'penix', name: 'Michael Penix Jr.', pos: 'QB', slot: 'Bench', weekPts: 18 }),
      player({ id: 'warren', name: 'Tyler Warren', pos: 'TE', slot: 'TE', weekPts: 6 }),
      player({ id: 'te2', name: 'Backup TE', pos: 'TE', slot: 'Bench', weekPts: 11 }),
      player({ id: 'rb1', name: 'RB1', pos: 'RB', slot: 'RB', weekPts: 14 }),
      player({ id: 'rb2', name: 'RB2', pos: 'RB', slot: 'RB', weekPts: 12 }),
      player({ id: 'wr1', name: 'WR1', pos: 'WR', slot: 'WR', weekPts: 13 }),
      player({ id: 'wr2', name: 'WR2', pos: 'WR', slot: 'WR', weekPts: 11 }),
      player({ id: 'flex1', name: 'Flex1', pos: 'WR', slot: 'FLEX', weekPts: 10 }),
      player({ id: 'flex2', name: 'Flex2', pos: 'RB', slot: 'FLEX', weekPts: 9 }),
    ]
    const advice = weekAdvice(roster, 8)
    expect(advice.swaps.map((s) => `${s.in.name} over ${s.out.name} (${s.slot})`).sort()).toEqual([
      'Backup TE over Tyler Warren (TE)',
      'Michael Penix Jr. over Old QB (QB)',
    ])
    for (const swap of advice.swaps) expect(fitsSlot(swap.in.pos, swap.slot)).toBe(true)
    expect(advice.swaps.some((s) => s.in.pos === 'QB' && s.slot === 'TE')).toBe(false)
  })

  test('flex stays a skill position', () => {
    expect(fitsSlot('QB', 'QB')).toBe(true)
    expect(fitsSlot('QB', 'TE')).toBe(false)
    expect(fitsSlot('QB', 'FLEX')).toBe(false)
    expect(fitsSlot('TE', 'FLEX')).toBe(true)
    expect(fitsSlot('WR', 'RB')).toBe(false)
  })
})
