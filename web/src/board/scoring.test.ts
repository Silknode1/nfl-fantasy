import { describe, expect, test } from 'vitest'
import summary from './fixtures/sf-wsh-summary.json'
import { scoringTrips, spotLabel } from './scoring'

const SIDES = { homeId: '25', homeAbbr: 'SF', awayId: '28', awayAbbr: 'WSH' }

describe('scoring plays', () => {
  test('each scoring play appears once, in order, with the field position ESPN sent', () => {
    const trips = scoringTrips(summary, SIDES)
    expect(trips).toHaveLength(7)
    expect(new Set(trips.map((t) => t.id)).size).toBe(7)
    const first = trips[0]!
    expect(first.team).toBe('SF')
    expect(first.kind).toBe('Touchdown')
    expect(first.field).toEqual({ offense: 'SF', defense: 'WSH', driveStart: 36, playStart: 89, playEnd: 100 })
    const wshFieldGoal = trips[1]!
    expect(wshFieldGoal.kind).toBe('Field Goal')
    expect(wshFieldGoal.field).toEqual({ offense: 'WSH', defense: 'SF', driveStart: 35, playStart: 67, playEnd: 100 })
  })

  test('scoring plays are not duplicated when ESPN repeats one', () => {
    const doubled = { ...summary, scoringPlays: [...summary.scoringPlays, summary.scoringPlays[0]] }
    expect(scoringTrips(doubled, SIDES)).toHaveLength(7)
  })

  test('a play without both ends of its field position gets no diagram', () => {
    const play = summary.scoringPlays[0]!
    const stripped = {
      scoringPlays: [play],
      drives: { previous: summary.drives.previous.map((d) => ({ ...d, plays: d.plays.map((p) => ({ ...p, end: undefined })) })) },
    }
    const [trip] = scoringTrips(stripped, SIDES)
    expect(trip!.text).toBe(play.text)
    expect(trip!.field).toBeNull()
    expect(scoringTrips({ scoringPlays: [play] }, SIDES)[0]!.field).toBeNull()
  })

  test('a defensive or return score is not drawn as the offense driving', () => {
    const play = summary.scoringPlays[0]!
    const flipped = { ...summary, scoringPlays: [{ ...play, team: { id: '28', abbreviation: 'WSH' } }] }
    expect(scoringTrips(flipped, SIDES)[0]!.field).toBeNull()
  })

  test('spot labels', () => {
    expect(spotLabel(36, 'WSH')).toBe('Own 36')
    expect(spotLabel(50, 'WSH')).toBe('50')
    expect(spotLabel(89, 'WSH')).toBe('WSH 11')
    expect(spotLabel(100, 'WSH')).toBe('End zone')
  })
})
