import { describe, expect, test } from 'vitest'
import snapshot from '../../public/data/scoreboard.json'
import { normalizeScoreboard, type BoardGame } from './normalize'
import { bubbleFacts, rowSpeed, scrimFor, shouldAnimate, spreadSlot, tickerRowCount, tickerRows, trackOffset, whiteContrast, wrap } from './ticker'

const SF_WSH = '401873008'
const BAL_CLE = '401872997'

function week(live: string[] = []): BoardGame[] {
  return normalizeScoreboard(snapshot, '2026-10-18T18:00:00Z').games.map((game) => (live.includes(game.id)
    ? { ...game, state: 'in', detail: '8:14 - 2nd', away: { ...game.away, score: 10 }, home: { ...game.home, score: 7 } }
    : game))
}

describe('ticker rows', () => {
  test('the whole week sits in three or four rows, every game once', () => {
    const games = week()
    const rows = tickerRows(games)
    expect(rows).toHaveLength(4)
    const ids = rows.flatMap((row) => row.games.map((game) => game.id))
    expect(ids).toHaveLength(14)
    expect(new Set(ids).size).toBe(14)
    expect(rows.map((row) => row.games.length)).toEqual([4, 4, 3, 3])
    expect(tickerRowCount(12)).toBe(3)
    expect(tickerRowCount(13)).toBe(4)
    expect(tickerRowCount(2)).toBe(2)
    expect(tickerRowCount(0)).toBe(0)
  })

  test('live games land in the top rows', () => {
    const rows = tickerRows(week([SF_WSH, BAL_CLE]))
    expect(rows[0]!.games.slice(0, 2).map((game) => game.id).sort()).toEqual([BAL_CLE, SF_WSH].sort())
    expect(rows.slice(1).flatMap((row) => row.games).some((game) => game.state === 'in')).toBe(false)
  })

  test('rows alternate direction and move at different, drifting speeds', () => {
    const rows = tickerRows(week())
    expect(rows.map((row) => row.direction)).toEqual(['left', 'right', 'left', 'right'])
    const speeds = [0, 1, 2, 3].map((i) => rowSpeed(i, 0))
    expect(new Set(speeds.map((s) => s.toFixed(2))).size).toBe(4)
    expect(rowSpeed(0, 10)).not.toBeCloseTo(rowSpeed(0, 0), 3)
    for (const t of [0, 7, 19, 40]) for (const i of [0, 1, 2, 3]) expect(rowSpeed(i, t)).toBeGreaterThan(0)
  })

  test('first load shows the real copy in place in both directions, and the loop wraps', () => {
    expect(trackOffset('left', 0, 800)).toBeCloseTo(0)
    expect(trackOffset('right', 0, 800)).toBe(-800)
    expect(trackOffset('left', 850, 800)).toBe(-50)
    expect(trackOffset('right', 850, 800)).toBe(-750)
    expect(wrap(-10, 100)).toBe(90)
    expect(wrap(5, 0)).toBe(0)
  })

  test('a row only animates when one copy fits and motion is allowed', () => {
    expect(shouldAnimate(600, 1200, false)).toBe(true)
    expect(shouldAnimate(600, 1200, true)).toBe(false)
    expect(shouldAnimate(1400, 1200, false)).toBe(false)
    expect(shouldAnimate(600, 0, false)).toBe(false)
  })
})

describe('bubble facts', () => {
  test('away, score, home on top; spread and status under the score', () => {
    const live = week([SF_WSH]).find((game) => game.id === SF_WSH)!
    const facts = bubbleFacts(live)
    expect(facts.away).toBe('WSH')
    expect(facts.home).toBe('SF')
    expect(facts.middle).toBe('10–7')
    expect(facts.live).toBe(true)
    expect(facts.status).toBe('8:14 - 2nd')
    expect(facts.spread).toMatch(/^SF [+-]\d/)
    const final = week().find((game) => game.state === 'post')!
    expect(bubbleFacts(final).status).toMatch(/^Final/)
  })

  test('missing quote leaves the spread empty', () => {
    const game = { ...week()[0]!, quote: null }
    expect(spreadSlot(game)).toBeNull()
    expect(bubbleFacts(game).spread).toBeNull()
    const noLine = { ...week()[1]!, quote: { ...week()[1]!.quote!, home: { ...week()[1]!.quote!.home, line: null } } }
    expect(bubbleFacts(noLine).spread).toBeNull()
  })

  test('white score text clears 4.5:1 on every team color in the snapshot under the chosen scrim', () => {
    for (const game of week()) {
      const scrim = scrimFor([game.away.color, game.home.color])
      expect(whiteContrast(game.away.color, scrim)).toBeGreaterThanOrEqual(4.5)
      expect(whiteContrast(game.home.color, scrim)).toBeGreaterThanOrEqual(4.5)
    }
    expect(scrimFor(['#ffffff'])).toBeGreaterThan(0.5)
    expect(scrimFor(['#000000'])).toBe(0.2)
  })
})
