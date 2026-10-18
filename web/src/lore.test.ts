import { describe, expect, test } from 'vitest'
import raw from '../public/data/fantasy.json'
import type { FantasyData } from './types'
import { coincidenceLine, gapLine, quietLine, scoutLine } from './lore'

const data = raw as unknown as FantasyData

describe('desk lore', () => {
  test('quiet line uses the quietest starter and the narrowest range', () => {
    const line = quietLine(data)
    expect(line).toContain('Tyler Warren')
    expect(line).toContain('Kirk Cousins')
    expect(line).toMatch(/4\.9/)
  })

  test('week coincidence is the unbeaten points gap', () => {
    const line = coincidenceLine(data)
    expect(line).toContain('Carney Carnival')
    expect(line).toContain('Uncle Beef')
    expect(line).toContain('5–0')
  })

  test('gap chord names the closest points-for pair', () => {
    const line = gapLine(data)
    expect(line).toContain('Inflatable All-Stars')
    expect(line).toContain('CutchToldUs')
  })

  test('scout line crosses the roster and the 24-hour pulse', () => {
    const line = scoutLine(data, [])
    expect(line).toContain('Darius Cooper')
    expect(line).toContain('24-hour')
  })

  test('a trending trade piece is preferred when the search has one', () => {
    const kirk = data.players.find((p) => p.name === 'Kirk Cousins')
    expect(kirk).toBeTruthy()
    const line = scoutLine(data, [kirk!.id])
    expect(line).toContain('Kirk Cousins')
    expect(line).toContain('recommended trade')
  })
})
