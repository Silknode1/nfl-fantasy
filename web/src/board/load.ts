import { normalizeScoreboard, normalizeSummary, scoreboardBody, type Board, type BoardGame, type GameContext } from './normalize'

const SCOREBOARD = '/espn/apis/site/v2/sports/football/nfl/scoreboard'

/** ESPN's default board stays on the week that just ended. Ask for the league week when we have one. */
export function scoreboardPath(week?: number | null): string {
  if (week == null || !Number.isFinite(week) || week <= 0) return SCOREBOARD
  return `${SCOREBOARD}?seasontype=2&week=${Math.trunc(week)}`
}

async function readScoreboard(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`)
  return res.json()
}

export async function fetchScoreboard(week?: number | null): Promise<{ board: Board; source: 'live' | 'snapshot' }> {
  const fetchedAt = new Date().toISOString()
  try {
    let raw = await readScoreboard(scoreboardPath(week))
    let { body } = scoreboardBody(raw)
    if (week != null && week > 0 && (!Array.isArray(body.events) || body.events.length === 0)) {
      raw = await readScoreboard(SCOREBOARD)
      body = scoreboardBody(raw).body
    }
    if (!Array.isArray(body.events) || body.events.length === 0) throw new Error('ESPN scoreboard had no games')
    return { board: normalizeScoreboard(raw, fetchedAt), source: 'live' }
  } catch (liveError) {
    const res = await fetch('data/scoreboard.json', { cache: 'no-store' })
    if (!res.ok) {
      const reason = liveError instanceof Error ? liveError.message : 'ESPN scoreboard failed'
      throw new Error(`${reason}. Saved scoreboard is missing too.`)
    }
    const raw: unknown = await res.json()
    return { board: normalizeScoreboard(raw, fetchedAt), source: 'snapshot' }
  }
}

export async function fetchGameSummary(game: BoardGame): Promise<{ context: GameContext; raw: unknown }> {
  const res = await fetch(`/espn/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(game.id)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Game detail ${res.status}`)
  const raw: unknown = await res.json()
  return { context: normalizeSummary(raw, game), raw }
}

export async function fetchGameContext(game: BoardGame): Promise<GameContext> {
  return (await fetchGameSummary(game)).context
}
