import { linkNewsToPlayers, type NewsItem } from './parse'

/**
 * A player on the roster left the game or is out. The pattern is the kind of headline,
 * not a sentence from one player. Recent means inside the last 7 days of `now`,
 * or a scoreboard line with no timestamp (that board is the current week).
 */
const OUT = /\b(achilles|left the game|ruled out|carted(?: off)?|on a cart|\bcart\b|will not return|won't return|wont return|did not return|didn't return|didnt return|out for the season|out for the year|season-ending|placed on ir|injured reserve)\b/i

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type { NewsItem }

function recent(item: NewsItem, now: number): boolean {
  if (!item.published) return item.source === 'scoreboard'
  const t = Date.parse(item.published)
  if (Number.isNaN(t)) return false
  return t <= now + 60 * 60 * 1000 && now - t <= WEEK_MS
}

/** Headlines from the feed that match a roster player and say he left or is out. Empty when none do. */
export function breakingRosterNews(
  items: NewsItem[],
  roster: { id: string; name: string }[],
  now: number,
): NewsItem[] {
  const ids = new Set(roster.map((p) => p.id))
  const linked = linkNewsToPlayers(items, roster.map((p) => ({ id: p.id, name: p.name, nfl: '' })))
  const hits: NewsItem[] = []
  const seen = new Set<string>()
  for (const item of linked) {
    if (!item.playerId || !ids.has(item.playerId)) continue
    const text = `${item.headline} ${item.summary ?? ''}`
    if (!OUT.test(text)) continue
    if (!recent(item, now)) continue
    const key = item.headline.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    hits.push(item)
  }
  return hits
}
