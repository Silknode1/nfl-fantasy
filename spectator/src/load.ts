import { normalizeScoreboard, normalizeSummary, scoreboardBody, type Board, type BoardGame, type GameContext } from './board/normalize'
import { headlinesFromScoreboard, type Headline } from './story'

const SCOREBOARD = '/espn/apis/site/v2/sports/football/nfl/scoreboard'

export interface Slate {
  board: Board
  headlines: Headline[]
}

export async function fetchSlate(): Promise<Slate> {
  const fetchedAt = new Date().toISOString()
  const res = await fetch(SCOREBOARD, { cache: 'no-store' })
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
