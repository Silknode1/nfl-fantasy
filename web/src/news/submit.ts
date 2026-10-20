/**
 * A link the user pasted onto the desk. The summary is only sentences from text
 * they pasted. A URL already in the feed is promoted instead of copied.
 */

import { dedupeNews, type NewsItem } from '../espn/parse'
import { previewText } from './preview'

export const DESK_NEWS_KEY = 'desk-news-submissions'
export const DESK_NEWS_EVENT = 'desk-news'

export type DeskScope = 'league' | 'team' | 'player'

export interface DeskClub {
  abbr: string
  name: string
}

export interface DeskPlayerRef {
  id: string
  name: string
  nfl: string
}

export interface DeskSubmission {
  id: string
  url: string
  title: string
  pasted: string
  summary: string | null
  scope: DeskScope
  team: string | null
  playerId: string | null
  teams: string[]
  createdAt: string
}

export interface SubmitInput {
  url: string
  title: string
  pasted: string
  scope: DeskScope
  team: string | null
  playerId: string | null
  clubs?: DeskClub[]
  players?: DeskPlayerRef[]
  now?: string
}

type Store = Pick<Storage, 'getItem' | 'setItem'> | null

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url.trim())
    u.hash = ''
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1)
    return u.toString()
  } catch {
    return url.trim()
  }
}

function httpUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return canonicalUrl(u.toString())
  } catch {
    return null
  }
}

/** Clubs named in the user's own text. Abbreviations count only when typed in uppercase. */
export function namedTeams(text: string, clubs: DeskClub[]): string[] {
  const found: string[] = []
  const lower = text.toLowerCase()
  for (const club of clubs) {
    const abbr = club.abbr.trim().toUpperCase()
    if (!abbr) continue
    const name = club.name.trim()
    const byName = name.length > 3 && lower.includes(name.toLowerCase())
    const byAbbr = new RegExp(`\\b${abbr}\\b`).test(text)
    if ((byName || byAbbr) && !found.includes(abbr)) found.push(abbr)
  }
  return found
}

export function inferDeskScope(
  text: string,
  players: DeskPlayerRef[],
  clubs: DeskClub[],
): { scope: DeskScope; playerId: string | null; team: string | null; teams: string[] } {
  const sorted = [...players].filter((p) => p.name.trim().length > 4).sort((a, b) => b.name.length - a.name.length)
  const hay = text.toLowerCase()
  const player = sorted.find((p) => hay.includes(p.name.toLowerCase()))
  const teams = namedTeams(text, clubs)
  if (player) {
    const team = player.nfl ? player.nfl.toUpperCase() : teams[0] ?? null
    const all = team && !teams.includes(team) ? [team, ...teams] : teams
    return { scope: 'player', playerId: player.id, team, teams: all }
  }
  if (teams.length) return { scope: 'team', playerId: null, team: teams[0]!, teams }
  return { scope: 'league', playerId: null, team: null, teams: [] }
}

export function createSubmission(input: SubmitInput): { ok: true; submission: DeskSubmission } | { ok: false; error: string } {
  const url = httpUrl(input.url)
  if (!url) return { ok: false, error: 'Paste a full http or https link.' }
  const scope = input.scope
  const playerId = input.playerId?.trim() || null
  const team = input.team?.trim().toUpperCase() || null
  if (scope === 'player' && !playerId) return { ok: false, error: 'Pick the player this link is about.' }
  if (scope === 'team' && !team) return { ok: false, error: 'Pick the team this link is about.' }
  const title = input.title.replace(/\s+/g, ' ').trim() || url
  const pasted = input.pasted.replace(/\s+/g, ' ').trim()
  const summary = previewText(pasted, title)
  const player = input.players?.find((p) => p.id === playerId)
  const mentioned = namedTeams(`${input.title}\n${input.pasted}\n${url}`, input.clubs ?? [])
  const teams: string[] = []
  const add = (abbr: string | null | undefined) => {
    const next = abbr?.trim().toUpperCase()
    if (next && !teams.includes(next)) teams.push(next)
  }
  if (scope === 'team') add(team)
  if (scope === 'player') add(player?.nfl || team)
  for (const abbr of mentioned) add(abbr)
  const createdAt = input.now ?? new Date().toISOString()
  const id = `desk:${url}:${scope}:${scope === 'player' ? playerId : scope === 'team' ? team : 'league'}`
  return {
    ok: true,
    submission: {
      id,
      url,
      title,
      pasted,
      summary,
      scope,
      team: scope === 'league' ? teams[0] ?? null : team,
      playerId: scope === 'player' ? playerId : null,
      teams,
      createdAt,
    },
  }
}

export function toNewsItem(sub: DeskSubmission): NewsItem {
  return {
    id: sub.id,
    headline: sub.title,
    summary: sub.summary,
    published: sub.createdAt,
    url: sub.url,
    teams: sub.teams,
    playerId: sub.playerId,
    gameId: null,
    source: 'desk',
  }
}

export function readSubmissions(store: Store): DeskSubmission[] {
  try {
    const raw = store?.getItem(DESK_NEWS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSubmission)
  } catch {
    return []
  }
}

function isSubmission(value: unknown): value is DeskSubmission {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<DeskSubmission>
  return typeof row.id === 'string'
    && typeof row.url === 'string'
    && typeof row.title === 'string'
    && (row.scope === 'league' || row.scope === 'team' || row.scope === 'player')
    && Array.isArray(row.teams)
}

export function writeSubmissions(store: Store, items: DeskSubmission[]): void {
  try {
    store?.setItem(DESK_NEWS_KEY, JSON.stringify(items))
  } catch {
    /* private mode: the link lasts for this view only */
  }
}

export function saveSubmission(store: Store, sub: DeskSubmission): DeskSubmission[] {
  const next = [sub, ...readSubmissions(store).filter((row) => row.id !== sub.id)].slice(0, 40)
  writeSubmissions(store, next)
  return next
}

/** New links first. A URL already in the feed moves that feed row up and is not copied. */
export function mergeDeskNews(feed: NewsItem[], desk: NewsItem[]): NewsItem[] {
  const feedByUrl = new Map<string, NewsItem>()
  for (const item of feed) {
    if (item.url) feedByUrl.set(canonicalUrl(item.url), item)
  }
  const promoted = new Set<string>()
  const fresh: NewsItem[] = []
  for (const item of desk) {
    const hit = item.url ? feedByUrl.get(canonicalUrl(item.url)) : undefined
    if (hit) promoted.add(hit.id)
    else fresh.push(item)
  }
  const head = feed.filter((item) => promoted.has(item.id))
  const rest = feed.filter((item) => !promoted.has(item.id))
  return dedupeNews([...fresh, ...head, ...rest])
}

export function newsForLeague(items: NewsItem[]): NewsItem[] {
  return items
}

export function newsForPlayer(items: NewsItem[], playerId: string): NewsItem[] {
  return items.filter((item) => item.playerId === playerId)
}

export function newsForTeam(items: NewsItem[], abbr: string): NewsItem[] {
  const team = abbr.toUpperCase()
  return items.filter((item) => item.teams.some((t) => t.toUpperCase() === team))
}

export function newsForGame(items: NewsItem[], teams: string[]): NewsItem[] {
  const want = new Set(teams.map((t) => t.toUpperCase()).filter(Boolean))
  return items.filter((item) => item.teams.some((t) => want.has(t.toUpperCase())))
}

const AVAIL = /\b(questionable|doubtful|limited|did not practice|\bdnp\b|game-time decision|inactive|left the game|ruled out|will not return|won't return|wont return|will not play|out for the season|carted off)\b/i
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Desk links only. A rostered player whose pasted text updates availability. */
export function submittedBreaking(
  items: NewsItem[],
  roster: { id: string; name: string }[],
  now: number,
): NewsItem[] {
  const ids = new Set(roster.map((p) => p.id))
  const hits: NewsItem[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (item.source !== 'desk' || !item.playerId || !ids.has(item.playerId)) continue
    const text = `${item.headline} ${item.summary ?? ''}`
    if (!AVAIL.test(text)) continue
    if (item.published) {
      const t = Date.parse(item.published)
      if (Number.isNaN(t) || t > now + 60 * 60 * 1000 || now - t > WEEK_MS) continue
    }
    const key = item.headline.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    hits.push(item)
  }
  return hits
}

export function sourceLabel(source: NewsItem['source']): string {
  if (source === 'desk') return 'Your link'
  if (source === 'jev') return 'League news'
  if (source === 'scoreboard') return 'Scoreboard'
  return 'ESPN'
}
