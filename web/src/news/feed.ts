export interface NewsSortable {
  id: string
  published: string | null
  playerId: string | null
  teams: string[]
}

export interface PopularityPlayer {
  id: string
  /** ESPN percent rostered. */
  own: number
  /** Sleeper adds in the pulled window. */
  adds: number
}

export type NewsFilter = 'popularity' | 'date' | 'player' | 'team'
export type NewsKind = 'player' | 'team'

/**
 * Player news is tagged to one player. Team news is tagged to a team, or not tied to a
 * single player. An item with no player and no team is team news. A player tag wins when
 * both are present.
 */
export const UNTAGGED_RULE =
  'Player news is tagged to one player. Team news is tagged to a team, or not tied to a single player. An item with no player and no team is team news.'

/**
 * The feed items have no popularity field. The only signals are the tagged player's
 * ESPN rostered percent and, as a tiebreak, that player's Sleeper adds.
 */
export const POPULARITY_LABEL =
  'Popularity is the tagged player’s ESPN rostered percent. Sleeper adds break ties. Items with no tagged player in the league file have no signal and sort after scored items.'

export const DATE_LABEL =
  'Newest first by published time. Items with no published time follow the dated ones.'

export function newsKind(item: Pick<NewsSortable, 'playerId'>): NewsKind {
  return item.playerId ? 'player' : 'team'
}

export function publishedMs(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

function byId(players: PopularityPlayer[]): Map<string, PopularityPlayer> {
  return new Map(players.map((p) => [p.id, p]))
}

/** Null when this item has no rostered/adds signal. Zero rostered is still a signal. */
export function popularityScore(item: Pick<NewsSortable, 'playerId'>, players: PopularityPlayer[]): { rostered: number; adds: number } | null {
  if (!item.playerId) return null
  const player = byId(players).get(item.playerId)
  if (!player || !Number.isFinite(player.own)) return null
  return { rostered: player.own, adds: Number.isFinite(player.adds) ? player.adds : 0 }
}

function dateDelta(a: NewsSortable, b: NewsSortable): number {
  const am = publishedMs(a.published)
  const bm = publishedMs(b.published)
  if (am === null && bm === null) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  if (am === null) return 1
  if (bm === null) return -1
  return bm - am || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Popularity and date order the whole feed. Player and team keep only that kind,
 * still newest first. The input array is not mutated.
 */
export function filterNews<T extends NewsSortable>(items: T[], filter: NewsFilter, players: PopularityPlayer[]): T[] {
  const pool = filter === 'player' || filter === 'team' ? items.filter((item) => newsKind(item) === filter) : items
  const rows = [...pool]
  if (filter === 'popularity') {
    rows.sort((a, b) => {
      const pa = popularityScore(a, players)
      const pb = popularityScore(b, players)
      if (!pa && !pb) return dateDelta(a, b)
      if (!pa) return 1
      if (!pb) return -1
      return pb.rostered - pa.rostered || pb.adds - pa.adds || dateDelta(a, b)
    })
    return rows
  }
  rows.sort(dateDelta)
  return rows
}
