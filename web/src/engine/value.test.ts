import { describe, expect, test } from 'vitest'
import type { Player, Pos } from '../types'
import { playerValue } from './lineup'
import { REPLACEMENT_RANK, tradeTable, tradeValue } from './value'

const FROM = 8
const REG = 14
const LAST = 17

function flat(points: number, from = FROM, last = LAST): Record<string, number> {
  const proj: Record<string, number> = {}
  for (let w = from; w <= last; w++) proj[String(w)] = points
  return proj
}

function player(over: Partial<Player> & { id: string; pos: Pos; proj: Record<string, number> }): Player {
  return {
    name: over.id,
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

describe('trade value', () => {
  test('surplus is rest-of-season production minus the replacement player', () => {
    const wrs = Array.from({ length: 40 }, (_, i) => player({ id: `w${i}`, pos: 'WR', proj: flat(40 - i) }))
    const subject = wrs[0]
    const tv = tradeValue(subject, wrs, FROM, REG, LAST)
    expect(tv.production).toBeCloseTo(playerValue(subject, FROM, REG, LAST))
    expect(tv.replacement).toBeCloseTo(11)
    expect(tv.surplus).toBeCloseTo(29)
    expect(tradeValue(wrs[REPLACEMENT_RANK.WR - 1], wrs, FROM, REG, LAST).surplus).toBeCloseTo(0)
  })

  test('the same points are worth more at a scarcer position', () => {
    const wrs = Array.from({ length: 40 }, (_, i) => player({ id: `w${i}`, pos: 'WR', proj: flat(40 - i) }))
    const tes = Array.from({ length: 12 }, (_, i) => player({ id: `t${i}`, pos: 'TE', proj: flat(20 - i) }))
    const pool = [...wrs, ...tes]
    const wr = wrs[28] // 12 pts, one point above the WR30 replacement
    const te = tes[8] // 12 pts, three points above the TE12 replacement
    const table = tradeTable(pool, FROM, REG, LAST)
    expect(table.get(wr.id)!.production).toBeCloseTo(12)
    expect(table.get(te.id)!.production).toBeCloseTo(12)
    expect(table.get(te.id)!.surplus).toBeGreaterThan(table.get(wr.id)!.surplus)
    expect(table.get(te.id)!.surplus).toBeCloseTo(3)
    expect(table.get(wr.id)!.surplus).toBeCloseTo(1)
  })

  test('a bye week lowers trade value', () => {
    const full = player({ id: 'full', pos: 'QB', proj: flat(18) })
    const bye = player({ id: 'bye', pos: 'QB', proj: { ...flat(18), '9': 0 } })
    const pool = [full, bye]
    const table = tradeTable(pool, FROM, REG, LAST)
    expect(table.get(bye.id)!.production).toBeLessThan(table.get(full.id)!.production)
    expect(table.get(bye.id)!.surplus).toBeLessThan(table.get(full.id)!.surplus)
  })

  test('playoff weeks count one and a half times in the production', () => {
    const playoffOnly = player({
      id: 'po',
      pos: 'RB',
      proj: { ...flat(0), '15': 10, '16': 10, '17': 10 },
    })
    const tv = tradeValue(playoffOnly, [playoffOnly], FROM, REG, LAST)
    // 7 regular weeks at 0 plus 3 playoff weeks at 10 × 1.5, over weight 7 + 4.5.
    expect(tv.production).toBeCloseTo(45 / 11.5)
    expect(tv.production).not.toBeCloseTo(3)
  })

  test('a player below replacement has negative surplus', () => {
    const qbs = Array.from({ length: 20 }, (_, i) => player({ id: `q${i}`, pos: 'QB', proj: flat(20 - i) }))
    const tv = tradeValue(qbs[19], qbs, FROM, REG, LAST)
    expect(tv.replacement).toBeCloseTo(9) // QB12 is 20 - 11 = 9
    expect(tv.surplus).toBeLessThan(0)
    expect(tv.surplus).toBeCloseTo(1 - 9)
  })

  test('a short position pool uses the last player as replacement', () => {
    const qbs = [
      player({ id: 'a', pos: 'QB', proj: flat(22) }),
      player({ id: 'b', pos: 'QB', proj: flat(16) }),
      player({ id: 'c', pos: 'QB', proj: flat(8) }),
    ]
    const tv = tradeValue(qbs[0], qbs, FROM, REG, LAST)
    expect(tv.replacement).toBeCloseTo(8)
    expect(tv.surplus).toBeCloseTo(14)
  })
})
