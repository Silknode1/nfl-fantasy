/**
 * Finding a team on the Games page. Search marks games; it never removes one from
 * the week and never moves the selection by itself. Only an explicit commit
 * (Enter, or a click) selects.
 */

import { matchGame, type BoardGame } from './normalize'

const STATE_RANK: Record<BoardGame['state'], number> = { in: 0, pre: 1, post: 2 }

/** Live games first, then upcoming, then finals. Kickoff, then id, inside each group. */
export function liveFirst(games: BoardGame[]): BoardGame[] {
  return [...games].sort((a, b) =>
    STATE_RANK[a.state] - STATE_RANK[b.state]
    || a.kickoff.localeCompare(b.kickoff)
    || a.id.localeCompare(b.id))
}

/** Ids of games the query names. An empty query marks nothing, so nothing is dimmed. */
export function matchingIds(games: BoardGame[], query: string): Set<string> {
  if (!query.trim()) return new Set()
  return new Set(games.filter((game) => matchGame(game, query)).map((game) => game.id))
}

/** The game Enter would open: the first match in live-first order. */
export function commitTarget(games: BoardGame[], query: string): string | null {
  if (!query.trim()) return null
  return liveFirst(games).find((game) => matchGame(game, query))?.id ?? null
}

export interface SearchView {
  /** Every game this week, whatever the query says. */
  games: BoardGame[]
  matches: Set<string>
  selectedId: string | null
}

/**
 * What the page shows for a query. The query only decides which bubbles are marked.
 * The selected id passes through untouched, including when the query is cleared.
 */
export function searchView(games: BoardGame[], query: string, selectedId: string | null): SearchView {
  return {
    games: liveFirst(games),
    matches: matchingIds(games, query),
    selectedId: selectedId && games.some((game) => game.id === selectedId) ? selectedId : null,
  }
}
