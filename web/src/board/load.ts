import { normalizeScoreboard, normalizeSummary, scoreboardBody, type Board, type BoardGame, type GameContext } from './normalize'

const SCOREBOARD = '/espn/apis/site/v2/sports/football/nfl/scoreboard'

export async function fetchScoreboard(): Promise<{ board: Board; source: 'live' | 'snapshot' }> {
  const fetchedAt = new Date().toISOString()
  try {
    const res = await fetch(SCOREBOARD, { cache: 'no-store' })
    if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`)
    const raw: unknown = await res.json()
    const { body } = scoreboardBody(raw)
    if (!Array.isArray(body.events)) throw new Error('ESPN scoreboard had no games')
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

export async function fetchGameContext(game: BoardGame): Promise<GameContext> {
  const res = await fetch(`/espn/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(game.id)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Game detail ${res.status}`)
  return normalizeSummary(await res.json(), game)
}
