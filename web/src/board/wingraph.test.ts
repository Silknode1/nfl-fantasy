import { describe, expect, test } from 'vitest'
import summary from './fixtures/sf-wsh-summary.json'
import { axisTicks, clockSeconds, elapsedAt, latestLabel, periodBands, winGraph } from './wingraph'

describe('win graph', () => {
  test('no win series means no drawn line', () => {
    expect(winGraph({}, 'SF', 'WSH')).toBeNull()
    expect(winGraph({ winprobability: [] }, 'SF', 'WSH')).toBeNull()
    expect(winGraph({ predictor: { homeTeam: { gameProjection: '61' } } }, 'SF', 'WSH')).toBeNull()
  })

  test('places ESPN points on the game clock and leaves off the one with no play clock', () => {
    const graph = winGraph(summary, 'SF', 'WSH')!
    expect(graph.timed).toBe(true)
    expect(summary.winprobability).toHaveLength(179)
    expect(graph.points).toHaveLength(178)
    expect(graph.end).toBe(3600)
    expect(graph.points[0]!.t).toBe(0)
    for (let i = 1; i < graph.points.length; i++) expect(graph.points[i]!.t).toBeGreaterThanOrEqual(graph.points[i - 1]!.t)
    for (const p of graph.points) {
      expect(p.home).toBeGreaterThanOrEqual(0)
      expect(p.home).toBeLessThanOrEqual(100)
    }
  })

  test('the latest point names the leader and its percent', () => {
    const graph = winGraph(summary, 'SF', 'WSH')!
    const last = graph.points[graph.points.length - 1]!
    expect(graph.latest.t).toBe(last.t)
    expect(graph.latest.leader).toBe(last.home >= 50 ? 'SF' : 'WSH')
    expect(latestLabel({ t: 10, home: 31.4, away: 68.6 }, 'SF', 'WSH')).toEqual({ t: 10, home: 31.4, leader: 'WSH', pct: 68.6 })
    expect(latestLabel({ t: 10, home: 50, away: 50 }, 'SF', 'WSH').leader).toBeNull()
  })

  test('axis marks every quarter boundary with the quarter clock and game time left', () => {
    const ticks = axisTicks(4)
    expect(ticks.filter((t) => t.boundary).map((t) => t.t)).toEqual([0, 900, 1800, 2700, 3600])
    expect(ticks[0]).toEqual({ t: 0, quarterClock: '15:00', gameLeft: '60:00', boundary: true })
    expect(ticks.find((t) => t.t === 450)).toEqual({ t: 450, quarterClock: '7:30', gameLeft: '52:30', boundary: false })
    expect(ticks[ticks.length - 1]).toEqual({ t: 3600, quarterClock: '0:00', gameLeft: '0:00', boundary: true })
    expect(periodBands(5).map((b) => b.label)).toEqual(['1st', '2nd', '3rd', '4th', 'OT'])
    const ot = axisTicks(5)
    expect(ot[ot.length - 1]!.t).toBe(4200)
  })

  test('clock math', () => {
    expect(clockSeconds('10:53')).toBe(653)
    expect(clockSeconds('0:07')).toBe(7)
    expect(clockSeconds('soon')).toBeNull()
    expect(elapsedAt(1, 900)).toBe(0)
    expect(elapsedAt(2, 450)).toBe(1350)
    expect(elapsedAt(4, 0)).toBe(3600)
    expect(elapsedAt(5, 300)).toBe(3900)
  })

  test('a series whose play ids have no clock is drawn in play order, not on an invented clock', () => {
    const graph = winGraph({ winprobability: [{ homeWinPercentage: 0.4, playId: 'x' }, { homeWinPercentage: 0.7, playId: 'y' }] }, 'SF', 'WSH')!
    expect(graph.timed).toBe(false)
    expect(graph.ticks).toEqual([])
    expect(graph.points.map((p) => p.home)).toEqual([40, 70])
    expect(graph.latest).toEqual({ t: 1, home: 70, leader: 'SF', pct: 70 })
  })
})
