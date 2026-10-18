import type { FantasyData, Player } from './types'
import { weekRange } from './components/RangeChart'

const STARTER = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX'])

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const commas = (n: number) => Math.round(n).toLocaleString('en-US')

function myStarters(d: FantasyData): Player[] {
  return d.players.filter((p) => p.teamId === d.meta.myTeamId && !!p.slot && STARTER.has(p.slot))
}

/** Quietest starter this week, and the starter with the tightest floor-to-ceiling. */
export function quietLine(d: FantasyData): string | null {
  const week = String(d.meta.week)
  const rows = myStarters(d)
    .map((p) => ({ p, pts: p.proj[week] ?? 0, range: weekRange(p, d.meta.week) }))
    .filter((row) => row.pts > 0 && row.range)
  if (!rows.length) return null
  const quiet = rows.reduce((a, b) => (b.pts < a.pts ? b : a))
  const narrow = rows.reduce((a, b) => ((b.range!.ceil - b.range!.floor) < (a.range!.ceil - a.range!.floor) ? b : a))
  const gap = narrow.range!.ceil - narrow.range!.floor
  if (quiet.p.id === narrow.p.id) {
    return `${quiet.p.name} is the quietest starter this week, ${one(quiet.pts)} points, and the narrowest floor-to-ceiling, ${one(gap)} points.`
  }
  return `${quiet.p.name} is the quietest starter this week, ${one(quiet.pts)} points. ${narrow.p.name} has the narrowest floor-to-ceiling, ${one(gap)} points.`
}

/** A one-line league coincidence. Two unbeaten clubs, or a shared bye if the race is already settled. */
export function coincidenceLine(d: FantasyData): string | null {
  const undefeated = d.teams.filter((t) => t.wins > 0 && t.losses === 0).sort((a, b) => b.pf - a.pf)
  if (undefeated.length >= 2) {
    const lead = undefeated[0]!
    const next = undefeated[1]!
    const gap = lead.pf - next.pf
    if (gap < 0.05) return `${lead.name} and ${next.name} are both ${lead.wins}–0, and level on points scored.`
    return `Two clubs are still ${lead.wins}–0. ${lead.name} has scored ${one(gap)} more points than ${next.name}.`
  }
  const bye = d.players.filter((p) => p.teamId === d.meta.myTeamId && p.bye === d.meta.week)
  if (bye.length >= 2) {
    const names = bye.slice(0, 3).map((p) => p.name)
    const list = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
    return `Week ${d.meta.week} is a shared bye for ${list}.`
  }
  return null
}

/** Closest pair of clubs on points scored. */
export function gapLine(d: FantasyData): string | null {
  const teams = [...d.teams].sort((a, b) => a.pf - b.pf)
  let best: { gap: number; a: string; b: string } | null = null
  for (let i = 1; i < teams.length; i++) {
    const gap = teams[i]!.pf - teams[i - 1]!.pf
    if (!best || gap < best.gap) best = { gap, a: teams[i - 1]!.name, b: teams[i]!.name }
  }
  if (!best) return null
  if (best.gap < 0.05) return `${best.a} and ${best.b} are level on points scored.`
  return `${best.a} and ${best.b} are the closest pair on points scored, ${one(best.gap)} apart.`
}

function trendMaps(d: FantasyData) {
  const win = d.trends?.sleeper?.['24h']
  const adds = new Map<string, number>()
  const drops = new Map<string, number>()
  for (const row of win?.add ?? []) if (row.id) adds.set(row.id, row.count ?? 0)
  for (const row of win?.drop ?? []) if (row.id) drops.set(row.id, row.count ?? 0)
  return { adds, drops }
}

function crossLine(p: Player, where: string, adds: Map<string, number>, drops: Map<string, number>): string | null {
  const added = adds.get(p.id)
  const dropped = drops.get(p.id)
  if (added != null && dropped != null) {
    return `${p.name} ${where} and on both the 24-hour add list and the drop list, ${commas(dropped)} drops.`
  }
  if (added != null) return `${p.name} ${where} and on the 24-hour add list, ${commas(added)} adds.`
  if (dropped != null) return `${p.name} ${where} and on the 24-hour drop list, ${commas(dropped)} drops.`
  return null
}

/**
 * Someone who shows up in two places: a recommended trade and the waiver pulse,
 * or your roster and the pulse, or the wire and the pulse.
 */
export function scoutLine(d: FantasyData, tradeIds: string[]): string {
  const { adds, drops } = trendMaps(d)
  const byId = new Map(d.players.map((p) => [p.id, p]))
  for (const id of tradeIds) {
    const p = byId.get(id)
    if (!p) continue
    const line = crossLine(p, 'is in a recommended trade', adds, drops)
    if (line) return line
  }
  const roster = d.players.filter((p) => p.teamId === d.meta.myTeamId)
  const both = roster.filter((p) => adds.has(p.id) && drops.has(p.id))
  for (const p of both) {
    const where = p.slot && STARTER.has(p.slot) ? 'is in your lineup' : 'is on your roster'
    const line = crossLine(p, where, adds, drops)
    if (line) return line
  }
  for (const p of roster) {
    const where = p.slot && STARTER.has(p.slot) ? 'is in your lineup' : 'is on your roster'
    const line = crossLine(p, where, adds, drops)
    if (line) return line
  }
  const free = d.players.filter((p) => !p.teamId || p.status !== 'ONTEAM')
  for (const p of free) {
    const line = crossLine(p, 'is unowned in this league', adds, drops)
    if (line) return line
  }
  return 'No player in this pull sits on two lists at once.'
}

export function sectionKey(kind: string, id: string): string {
  return `${kind}:${id}`
}
