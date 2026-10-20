import { describe, expect, test } from 'vitest'
import raw from '../../public/data/fantasy.json'
import type { FantasyData, Player, Pos } from '../types'
import { lineupNeeds, qbIsShort } from './needs'
import { composeTradeBoard, type Trade, type TradeEval } from './trade'

function ev(delta: number, give: Pos[], get: Pos[]): TradeEval {
  const piece = (pos: Pos, side: string, i: number): Player => ({
    id: `${side}-${pos}-${i}`,
    name: `${side} ${pos} ${i}`,
    pos,
    nfl: 'BUF',
    teamId: side === 'give' ? 4 : 2,
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
    espnSeason: 100,
    own: 90,
    ownChg: 0,
    started: 1,
    usage: null,
    adds: 0,
    drops: 0,
    jev: null,
    rate: 10,
    rateParts: { espn: 10, season: 10, trend: 1, jev: 1 },
    proj: {},
    sd: 4,
    ros: 0,
    playoffs: 0,
    ourRank: 1,
    espnRank: 1,
    tradeLocked: false,
    locked: false,
  })
  const trade: Trade = {
    partnerId: 2,
    give: give.map((pos, i) => piece(pos, 'give', i)),
    get: get.map((pos, i) => piece(pos, 'get', i)),
  }
  return {
    trade,
    me: { before: {} as TradeEval['me']['before'], after: {} as TradeEval['me']['after'], delta, regDelta: delta, poDelta: delta },
    partner: { before: {} as TradeEval['partner']['before'], after: {} as TradeEval['partner']['after'], delta: 0.4 },
    dropsMe: [],
    addsMe: [],
    dropsPartner: [],
    addsPartner: [],
    acceptance: 0.4,
    perceived: 0,
    score: delta,
    grade: 'B',
  }
}

describe('trade candidate mix', () => {
  test('a QB-only swap does not occupy the top of the board when the roster QB need is false', () => {
    const skill = ev(2.2, ['WR'], ['RB'])
    const qbOnly = ev(8, ['WR'], ['QB'])
    const board = composeTradeBoard([qbOnly, skill], false, 6)
    expect(board[0]!.trade.get[0]!.pos).toBe('RB')
    expect(board.some((row) => row.trade.get.some((p) => p.pos === 'QB'))).toBe(false)
  })

  test('a skill-position swap with a larger lineup delta ranks above a QB swap', () => {
    const skill = ev(4, ['RB'], ['WR'])
    const qb = ev(2, ['RB'], ['QB'])
    const board = composeTradeBoard([qb, skill], true, 6)
    const skillAt = board.findIndex((row) => row.me.delta === 4)
    const qbAt = board.findIndex((row) => row.trade.get.some((p) => p.pos === 'QB'))
    expect(skillAt).toBeGreaterThanOrEqual(0)
    expect(qbAt).toBeGreaterThan(skillAt)
  })

  test('when QB need is true a QB appears as part of a candidate, not as every row', () => {
    const skillWithQb = ev(3, ['WR', 'QB'], ['RB'])
    const getQb = ev(6, ['TE'], ['QB'])
    const board = composeTradeBoard([getQb, skillWithQb], true, 6)
    expect(board.length).toBeGreaterThan(1)
    expect(board.every((row) => row.trade.get.every((p) => p.pos === 'QB'))).toBe(false)
    expect(board.some((row) => [...row.trade.give, ...row.trade.get].some((p) => p.pos === 'QB'))).toBe(true)
  })
})

describe('lineup needs from the roster', () => {
  test('Carney Carnival QB need names Cousins and a weighted points gap', () => {
    const d = raw as unknown as FantasyData
    const needs = lineupNeeds(d)
    const qb = needs.filter((n) => n.slot === 'QB')
    expect(qb.length).toBeGreaterThan(0)
    expect(qb.every((n) => n.leaves.name === 'Kirk Cousins')).toBe(true)
    expect(qb.some((n) => n.gap > 0)).toBe(true)
    expect(qbIsShort(needs)).toBe(true)
  })
})
