import { normalizeScoreboard, normalizeSummary, scoreboardBody, type Board, type BoardGame, type GameContext } from './board/normalize'
import { headlinesFromScoreboard, type Headline } from './story'
import { athleteName, leaderAthleteIds, seasonYear, teamIdOf, type TeamParts } from './team'

const SCOREBOARD = '/espn/apis/site/v2/sports/football/nfl/scoreboard'

export interface Slate {
  board: Board
  headlines: Headline[]
}

/** Current week uses ESPN's default scoreboard. A numbered week asks for the regular season. */
export function scoreboardPath(week: number | null, season: number | null): string {
  if (week == null) return SCOREBOARD
  const query = new URLSearchParams({ week: String(week), seasontype: '2' })
  if (season) query.set('dates', String(season))
  return `${SCOREBOARD}?${query.toString()}`
}

export function leadersPath(season: number, teamId: string): string {
  return `/core/v2/sports/football/leagues/nfl/seasons/${encodeURIComponent(String(season))}/types/2/teams/${encodeURIComponent(teamId)}/leaders`
}

export async function fetchSlate(week: number | null = null, season: number | null = null): Promise<Slate> {
  const fetchedAt = new Date().toISOString()
  const res = await fetch(scoreboardPath(week, season), { cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`)
  const raw: unknown = await res.json()
  const { body } = scoreboardBody(raw)
  if (!Array.isArray(body.events)) throw new Error('ESPN scoreboard had no games')
  return {
    board: normalizeScoreboard(raw, fetchedAt),
    headlines: headlinesFromScoreboard(raw),
  }
}

const summaryCache = new Map<string, Promise<unknown>>()

export function fetchSummaryRaw(eventId: string): Promise<unknown> {
  const hit = summaryCache.get(eventId)
  if (hit) return hit
  const pending = fetch(`/espn/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(eventId)}`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Game detail ${res.status}`)
      return (await res.json()) as unknown
    })
    .catch((err: unknown) => {
      summaryCache.delete(eventId)
      throw err
    })
  summaryCache.set(eventId, pending)
  return pending
}

export function summaryContext(raw: unknown, game: BoardGame): GameContext {
  return normalizeSummary(raw, game)
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

const teamCache = new Map<string, Promise<TeamParts>>()

export function fetchTeamParts(abbr: string, seasonHint: number | null): Promise<TeamParts> {
  const key = `${abbr.toUpperCase()}:${seasonHint ?? ''}`
  const hit = teamCache.get(key)
  if (hit) return hit
  const pending = loadTeam(abbr, seasonHint).catch((err: unknown) => {
    teamCache.delete(key)
    throw err
  })
  teamCache.set(key, pending)
  return pending
}

async function loadTeam(abbr: string, seasonHint: number | null): Promise<TeamParts> {
  const slug = encodeURIComponent(abbr.toLowerCase())
  const team = await getJson(`/espn/apis/site/v2/sports/football/nfl/teams/${slug}`)
  if (!team) throw new Error(`The ${abbr} page didn't load`)
  const [schedule, stats, news] = await Promise.all([
    getJson(`/espn/apis/site/v2/sports/football/nfl/teams/${slug}/schedule`),
    getJson(`/espn/apis/site/v2/sports/football/nfl/teams/${slug}/statistics`),
    getJson(`/espn/apis/site/v2/sports/football/nfl/news?limit=8&team=${slug}`),
  ])
  const teamId = teamIdOf(team)
  const year = seasonHint || seasonYear(schedule) || seasonYear(stats)
  let leaders: unknown = null
  const names: Record<string, string> = {}
  if (teamId && year) {
    leaders = await getJson(leadersPath(year, teamId))
    await Promise.all(leaderAthleteIds(leaders).map(async (id) => {
      const raw = await getJson(`/espn/apis/common/v3/sports/football/nfl/athletes/${id}`)
      const name = athleteName(raw)
      if (name) names[id] = name
    }))
  }
  return { team, schedule, stats, leaders, names, news }
}
