/**
 * Scoring plays, once each, with the field position ESPN sent for the play and its drive.
 * Positions are yards from the scoring offense's own goal line (0) to the goal it attacks (100).
 * A play without both ends of that field position gets no diagram.
 */

import { scoringPlaysFrom, type ScoringPlay } from './desk'

export interface FieldTrip {
  offense: string
  defense: string
  /** Where the scoring drive began, when the drive's own plays show which way it was going. */
  driveStart: number | null
  playStart: number
  playEnd: number
}

export interface ScoringTrip extends ScoringPlay {
  kind: string
  field: FieldTrip | null
}

interface PlayRef {
  play: Record<string, unknown>
  drive: Record<string, unknown>
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function inField(n: number | null): n is number {
  return n != null && n >= 0 && n <= 100
}

function teamIdOf(v: unknown): string {
  return isRec(v) && isRec(v.team) ? str(v.team.id) : ''
}

function playIndex(raw: unknown): Map<string, PlayRef> {
  const out = new Map<string, PlayRef>()
  const body = isRec(raw) ? raw : {}
  const drives = isRec(body.drives) ? body.drives : {}
  const rows = [...arr(drives.previous), ...(isRec(drives.current) ? [drives.current] : [])]
  for (const drive of rows) {
    if (!isRec(drive)) continue
    for (const play of arr(drive.plays)) {
      if (isRec(play) && str(play.id)) out.set(str(play.id), { play, drive })
    }
  }
  return out
}

/**
 * ESPN's drive yardLine is on a fixed field, not the offense's. The drive's plays carry both
 * yardLine and yardsToEndzone, which tells us the direction. A play at midfield says nothing.
 */
export function driveDirection(drive: Record<string, unknown>, offenseId: string): 1 | -1 | null {
  for (const play of arr(drive.plays)) {
    if (!isRec(play) || !isRec(play.start)) continue
    if (offenseId && teamIdOf(play.start) && teamIdOf(play.start) !== offenseId) continue
    const line = num(play.start.yardLine)
    const toGo = num(play.start.yardsToEndzone)
    if (line == null || toGo == null || line === 50) continue
    if (line + toGo === 100) return 1
    if (line === toGo) return -1
  }
  return null
}

function scoringTeamIds(raw: unknown): Map<string, string> {
  const out = new Map<string, string>()
  const body = isRec(raw) ? raw : {}
  for (const row of arr(body.scoringPlays)) {
    if (isRec(row) && str(row.id) && isRec(row.team)) out.set(str(row.id), str(row.team.id))
  }
  return out
}

function kindOf(raw: unknown, id: string, text: string): string {
  const body = isRec(raw) ? raw : {}
  const row = arr(body.scoringPlays).find((r) => isRec(r) && str(r.id) === id)
  if (isRec(row) && isRec(row.scoringType)) {
    const name = str(row.scoringType.displayName) || str(row.scoringType.abbreviation)
    if (name) return name
  }
  if (/field goal/i.test(text)) return 'Field Goal'
  if (/safety/i.test(text)) return 'Safety'
  return 'Score'
}

export function fieldTrip(ref: PlayRef | undefined, scoringTeamId: string, sides: { homeId: string; homeAbbr: string; awayId: string; awayAbbr: string }): FieldTrip | null {
  if (!ref) return null
  const start = isRec(ref.play.start) ? ref.play.start : null
  const end = isRec(ref.play.end) ? ref.play.end : null
  if (!start || !end) return null
  const offenseId = teamIdOf(start)
  if (!offenseId || !scoringTeamId || offenseId !== scoringTeamId) return null
  const startToGo = num(start.yardsToEndzone)
  const endToGo = num(end.yardsToEndzone)
  if (!inField(startToGo) || !inField(endToGo)) return null
  const playStart = 100 - startToGo
  const playEnd = 100 - endToGo
  if (playEnd < playStart) return null
  const dir = driveDirection(ref.drive, offenseId)
  const driveLine = isRec(ref.drive.start) ? num(ref.drive.start.yardLine) : null
  const driveStartRaw = dir == null || driveLine == null ? null : dir === 1 ? driveLine : 100 - driveLine
  const driveStart = inField(driveStartRaw) && driveStartRaw <= playStart ? driveStartRaw : null
  const offense = offenseId === sides.homeId ? sides.homeAbbr : offenseId === sides.awayId ? sides.awayAbbr : ''
  const defense = offenseId === sides.homeId ? sides.awayAbbr : offenseId === sides.awayId ? sides.homeAbbr : ''
  if (!offense) return null
  return { offense, defense, driveStart, playStart, playEnd }
}

/** Scoring plays in game order, each id once, with a field trip when ESPN sent both ends of the play. */
export function scoringTrips(raw: unknown, sides: { homeId: string; homeAbbr: string; awayId: string; awayAbbr: string }): ScoringTrip[] {
  const plays = playIndex(raw)
  const teams = scoringTeamIds(raw)
  const seen = new Set<string>()
  const out: ScoringTrip[] = []
  for (const play of scoringPlaysFrom(raw)) {
    const key = play.id || `${play.quarter}|${play.clock}|${play.text}`
    if (seen.has(key)) continue
    seen.add(key)
    const ref = plays.get(play.id)
    const teamId = teams.get(play.id) || (ref && isRec(ref.drive.team) ? str(ref.drive.team.id) : '')
    out.push({ ...play, kind: kindOf(raw, play.id, play.text), field: fieldTrip(ref, teamId, sides) })
  }
  return out
}

/** "Own 36", "50", "WSH 11" for a spot measured from the offense's goal line. */
export function spotLabel(spot: number, defense: string): string {
  const s = Math.round(spot)
  if (s === 50) return '50'
  if (s >= 100) return 'End zone'
  if (s < 50) return `Own ${s}`
  return `${defense} ${100 - s}`
}
