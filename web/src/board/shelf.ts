/** The Games shelf: pinned games, the user's players in the selected game, and league news. */

import type { NewsItem } from '../espn/parse'

export interface NewsFilter {
  team: string
  text: string
}

/** Team is an abbreviation or '' for every club. Text matches the headline or summary. */
export function filterNews(items: NewsItem[], filter: NewsFilter): NewsItem[] {
  const team = filter.team.trim().toUpperCase()
  const text = filter.text.trim().toLowerCase()
  return items.filter((item) => {
    if (team && !item.teams.map((t) => t.toUpperCase()).includes(team)) return false
    if (text && !`${item.headline} ${item.summary ?? ''}`.toLowerCase().includes(text)) return false
    return true
  })
}

/** Clubs that appear on at least one headline, sorted, for the team filter. */
export function newsTeams(items: NewsItem[]): string[] {
  return [...new Set(items.flatMap((item) => item.teams.map((t) => t.toUpperCase())))].sort()
}

/** Newest pin first; pinning a game already on the shelf moves it to the top. */
export function pinGameId(ids: string[], id: string): string[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, 16)
}

export function unpinGameId(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id)
}

const SHELF_KEY = 'games-shelf'

export function readPinnedGames(store: Pick<Storage, 'getItem'> | null): string[] {
  try {
    const raw = store?.getItem(SHELF_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function writePinnedGames(store: Pick<Storage, 'setItem'> | null, ids: string[]): void {
  try {
    store?.setItem(SHELF_KEY, JSON.stringify(ids))
  } catch {
    /* private mode: the shelf lasts for this view only */
  }
}
